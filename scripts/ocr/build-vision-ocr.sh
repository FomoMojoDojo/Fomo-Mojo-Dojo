#!/usr/bin/env bash
# Compiles the Vision OCR helper the local parser calls (S2, 2026-11-16). macOS only; needs no install
# beyond the Swift toolchain that ships with the Command Line Tools. The binary is gitignored; the parser
# reports versions.ocr = "unavailable" and closes a scan as ocr_unavailable when it is missing.
#   bash scripts/ocr/build-vision-ocr.sh   →  scripts/ocr/bin/vision-ocr
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p bin
swiftc -O vision-ocr.swift -o bin/vision-ocr
./bin/vision-ocr --version
