# Contributing

Thanks for helping improve Wallpaper Engine Scene to MP4.

## Setup

- Use Linux, Node.js `>=14.14.0`, and npm.
- Install project dependencies with `npm install`.
- Run `./install.sh` to install system dependencies and build `linux-wallpaperengine` when needed. Review the installer prompts before approving system package installation.
- Start the interactive CLI with `node index.js`.

Xvfb rendering requires `xvfb-run` and `ffmpeg`. Cage rendering is experimental and additionally requires `cage` and `wf-recorder`.

## Changes and pull requests

- Keep changes focused and update the documentation when behavior or setup instructions change.
- Do not commit generated output videos, `.pkg` archives, dependency folders, or the built `bin/` directory.
- Describe what changed and how you checked it. Include the Linux distribution, rendering backend, and codec for rendering-related changes.
- There is no automated test suite yet. Run `node --check` on changed JavaScript files and `bash -n install.sh` when changing the installer; include relevant manual test results.

## Bug reports

Include the Linux distribution, Node.js version, selected backend and codec, the steps to reproduce the issue, and relevant error output. Do not attach Wallpaper Engine archives unless you have permission to share them.
