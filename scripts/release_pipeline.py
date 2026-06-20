#!/usr/bin/env python3
"""Publish versioned files under releases/ and build the website manifest."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, NoReturn


PLATFORMS = {"android", "ios", "linux", "mac", "windows"}
INSTALLER_SUFFIXES = (
    ".exe",
    ".msi",
    ".dmg",
    ".pkg",
    ".apk",
    ".ipa",
    ".appimage",
    ".deb",
    ".rpm",
    ".zip",
    ".tar.gz",
    ".tgz",
)
VERSION_RE = re.compile(r"(?<!\d)(\d+\.\d+\.\d+(?:\.\d+)*)(?!\d)")
PRERELEASE_RE = re.compile(
    r"(?:^|[-_.])(alpha|beta|dev|preview|rc|test)(?:[-_.]?\d+)?(?:[-_.]|$)",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class LocalAsset:
    absolute_path: Path
    path: str
    name: str
    platform: str
    version: str
    size: int
    prerelease: bool

    @property
    def tag(self) -> str:
        return f"v{self.version}"


def fail(message: str) -> NoReturn:
    raise SystemExit(message)


def display_path(path: Path, root: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return str(path)


def extract_version(filename: str) -> str | None:
    match = VERSION_RE.search(filename)
    return match.group(1) if match else None


def is_prerelease(filename: str) -> bool:
    stem = filename
    for suffix in Path(filename).suffixes:
        if stem.lower().endswith(suffix.lower()):
            stem = stem[: -len(suffix)]
    return bool(PRERELEASE_RE.search(stem))


def is_installer(filename: str) -> bool:
    return filename.lower().endswith(INSTALLER_SUFFIXES)


def scan_assets(root: Path) -> list[LocalAsset]:
    release_root = root / "releases"
    if not release_root.is_dir():
        return []

    assets: list[LocalAsset] = []
    errors: list[str] = []
    for path in sorted(item for item in release_root.rglob("*") if item.is_file()):
        relative = path.relative_to(root).as_posix()
        parts = path.relative_to(release_root).parts
        platform = parts[0].lower() if len(parts) > 1 else ""
        version = extract_version(path.name)
        if platform not in PLATFORMS:
            errors.append(f"{relative}: expected a platform folder ({', '.join(sorted(PLATFORMS))})")
            continue
        if not version:
            errors.append(f"{relative}: filename does not contain a dotted version")
            continue
        assets.append(
            LocalAsset(
                absolute_path=path,
                path=relative,
                name=path.name,
                platform=platform,
                version=version,
                size=path.stat().st_size,
                prerelease=is_prerelease(path.name),
            )
        )

    if errors:
        fail("Cannot publish releases:\n- " + "\n- ".join(errors))
    return assets


def group_assets(assets: Iterable[LocalAsset]) -> dict[str, list[LocalAsset]]:
    groups: dict[str, list[LocalAsset]] = {}
    for asset in assets:
        groups.setdefault(asset.version, []).append(asset)
    for version, items in groups.items():
        names = [item.name for item in items]
        duplicates = sorted({name for name in names if names.count(name) > 1})
        if duplicates:
            fail(
                f"Release v{version} has duplicate asset names across platform folders: "
                + ", ".join(duplicates)
            )
    return groups


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def generate_checksums(root: Path, assets: list[LocalAsset], output: Path) -> dict[str, str]:
    checksums = {asset.path: sha256_file(asset.absolute_path) for asset in assets}
    content = "".join(f"{checksums[path]}  {path}\n" for path in sorted(checksums))
    output.write_text(content, encoding="utf-8")
    print(f"Wrote {len(checksums)} checksums to {display_path(output, root)}")
    return checksums


def run_gh(args: list[str], repo: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    command = ["gh", *args, "--repo", repo]
    return subprocess.run(command, check=check, text=True, capture_output=True)


def release_asset_sizes(tag: str, repo: str) -> dict[str, int] | None:
    result = run_gh(["release", "view", tag, "--json", "assets"], repo, check=False)
    if result.returncode != 0:
        return None
    data = json.loads(result.stdout)
    return {asset["name"]: int(asset.get("size") or 0) for asset in data.get("assets", [])}


def create_release(version: str, items: list[LocalAsset], repo: str) -> None:
    tag = f"v{version}"
    notes = ["Published automatically from the versioned files in `releases/`.", "", "Assets:"]
    notes.extend(f"- `{item.name}` ({item.platform})" for item in items)
    args = [
        "release",
        "create",
        tag,
        "--title",
        f"Resistine {version}",
        "--notes",
        "\n".join(notes),
    ]
    if items and all(item.prerelease for item in items):
        args.append("--prerelease")
    result = run_gh(args, repo, check=False)
    if result.returncode != 0:
        fail(f"Could not create {tag}:\n{result.stderr.strip()}")
    print(f"Created {tag}")


def publish_assets(assets: list[LocalAsset], repo: str) -> None:
    if not assets:
        print("No files found under releases/; nothing to publish")
        return
    if not os.environ.get("GH_TOKEN") and not os.environ.get("GITHUB_TOKEN"):
        fail("GH_TOKEN or GITHUB_TOKEN is required to publish releases")

    for version, items in sorted(group_assets(assets).items()):
        tag = f"v{version}"
        existing = release_asset_sizes(tag, repo)
        if existing is None:
            create_release(version, items, repo)
            existing = {}

        for item in items:
            if existing.get(item.name) == item.size:
                print(f"Keeping {tag}/{item.name} (name and size already match)")
                continue
            result = run_gh(
                ["release", "upload", tag, str(item.absolute_path), "--clobber"],
                repo,
                check=False,
            )
            if result.returncode != 0:
                fail(f"Could not upload {item.path} to {tag}:\n{result.stderr.strip()}")
            print(f"Uploaded {item.path} to {tag}")


def github_api(repo: str, endpoint: str) -> Any:
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not token:
        fail("GITHUB_TOKEN or GH_TOKEN is required to generate the GitHub Releases manifest")
    request = urllib.request.Request(
        f"https://api.github.com/repos/{repo}/{endpoint.lstrip('/')}",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "resistine-release-pipeline",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        fail(f"GitHub API request failed ({error.code}): {body}")
    except urllib.error.URLError as error:
        fail(f"GitHub API request failed: {error.reason}")


def list_github_releases(repo: str) -> list[dict[str, Any]]:
    releases: list[dict[str, Any]] = []
    page = 1
    while True:
        batch = github_api(repo, f"releases?per_page=100&page={page}")
        if not isinstance(batch, list):
            fail("GitHub Releases API returned an unexpected response")
        releases.extend(batch)
        if len(batch) < 100:
            return releases
        page += 1


def release_notes(body: str | None) -> list[str]:
    if not body:
        return []
    if body.lstrip().startswith("Published automatically from the versioned files"):
        return []
    bullets = []
    for line in body.splitlines():
        match = re.match(r"^\s*[-*]\s+(.+?)\s*$", line)
        if match and not match.group(1).startswith("`"):
            bullets.append(match.group(1))
    return bullets or [body.strip()]


def infer_platform(name: str) -> str | None:
    lower = name.lower()
    if lower.endswith(".apk"):
        return "android"
    if lower.endswith(".ipa"):
        return "ios"
    if lower.endswith((".dmg", ".pkg")):
        return "mac"
    if lower.endswith((".exe", ".msi")):
        return "windows"
    if lower.endswith((".appimage", ".deb", ".rpm", ".tar.gz", ".tgz")):
        return "linux"
    return None


def parse_github_date(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except ValueError:
        return value


def generate_manifest(root: Path, assets: list[LocalAsset], repo: str, output: Path) -> None:
    checksums_path = root / "checksums.sha256"
    checksums: dict[str, str] = {}
    if checksums_path.exists():
        for line in checksums_path.read_text(encoding="utf-8").splitlines():
            match = re.match(r"^([a-fA-F0-9]{64})\s+\*?(.+)$", line)
            if match:
                checksums[match.group(2).strip()] = match.group(1).lower()

    local_by_tag_and_name = {(item.tag, item.name): item for item in assets}
    manifest_assets: list[dict[str, Any]] = []
    for release in list_github_releases(repo):
        if release.get("draft"):
            continue
        tag = str(release.get("tag_name") or "")
        tag_version = tag[1:] if tag.startswith("v") else tag
        for remote_asset in release.get("assets") or []:
            name = str(remote_asset.get("name") or "")
            if not is_installer(name):
                continue
            local = local_by_tag_and_name.get((tag, name))
            platform = local.platform if local else infer_platform(name)
            if not platform:
                continue
            version = local.version if local else extract_version(name) or tag_version
            path = local.path if local else f"releases/{platform}/{name}"
            manifest_assets.append(
                {
                    "path": path,
                    "name": name,
                    "platform": platform,
                    "version": version,
                    "size": int(remote_asset.get("size") or (local.size if local else 0)),
                    "date": parse_github_date(release.get("published_at") or release.get("created_at")),
                    "href": remote_asset.get("browser_download_url"),
                    "checksum": checksums.get(path, ""),
                    "notes": release_notes(release.get("body")),
                    "source": "GitHub Release",
                    "tag": tag,
                }
            )

    manifest_assets.sort(key=lambda item: (item["version"], item["platform"], item["name"]), reverse=True)
    local_fallbacks = [
        {
            "path": item.path,
            "name": item.name,
            "platform": item.platform,
            "version": item.version,
            "size": item.size,
            "date": None,
            "href": item.path,
            "checksum": checksums.get(item.path, ""),
            "notes": [],
            "source": "Local release",
            "tag": item.tag,
        }
        for item in assets
        if is_installer(item.name)
    ]
    manifest = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "repository": repo,
        "releases": manifest_assets,
        "fallbackReleases": local_fallbacks,
    }
    output.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(
        f"Wrote {len(manifest_assets)} GitHub Release assets and "
        f"{len(local_fallbacks)} local fallbacks to {display_path(output, root)}"
    )


def repository_name(value: str | None) -> str:
    repo = value or os.environ.get("GITHUB_REPOSITORY")
    if not repo or "/" not in repo:
        fail("Repository must be provided as owner/name or through GITHUB_REPOSITORY")
    return repo


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("inventory")

    checksums_parser = subparsers.add_parser("checksums")
    checksums_parser.add_argument("--output", type=Path)

    publish_parser = subparsers.add_parser("publish")
    publish_parser.add_argument("--repo")

    manifest_parser = subparsers.add_parser("manifest")
    manifest_parser.add_argument("--repo")
    manifest_parser.add_argument("--output", type=Path)

    args = parser.parse_args()
    root = args.root.resolve()
    assets = scan_assets(root)

    if args.command == "inventory":
        groups = group_assets(assets)
        for version, items in sorted(groups.items()):
            channel = "prerelease" if items and all(item.prerelease for item in items) else "release"
            print(f"v{version} ({channel})")
            for item in items:
                print(f"  {item.path}")
        print(f"{len(assets)} assets in {len(groups)} releases")
        return

    if args.command == "checksums":
        output = (args.output or root / "checksums.sha256").resolve()
        generate_checksums(root, assets, output)
        return

    if args.command == "publish":
        publish_assets(assets, repository_name(args.repo))
        return

    if args.command == "manifest":
        output = (args.output or root / "releases.json").resolve()
        generate_manifest(root, assets, repository_name(args.repo), output)
        return


if __name__ == "__main__":
    main()
