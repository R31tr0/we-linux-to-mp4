# Wallpaper Engine Scene to MP4

[![Platform](https://img.shields.io/badge/platform-Linux-informational?logo=linux)](https://www.kernel.org/)
[![Node.js](https://img.shields.io/badge/Node.js-required-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

This project converts interactive Wallpaper Engine `.pkg` scenes into MP4 videos on Linux. It can also extract ready-made videos from an archive.

> **Experimental software.** This is an early version and may be unstable. Compatibility and successful rendering of every scene are not guaranteed.

## Features

- Render Wallpaper Engine scenes to MP4.
- Choose the video duration, frame rate, and rendering backend.
- Choose a resolution preset when using Xvfb.
- Extract ready-made videos from an archive.
- Display an asset map of videos, textures, shaders, configs, audio, and other files.

## Requirements

- Linux, Node.js `>=14.14.0`, and npm.
- `ffmpeg` and `xvfb-run` for the default Xvfb recording backend.
- `cage` and `wf-recorder` for the experimental Cage headless backend.
- `git`, CMake, Make, and system development libraries to build the rendering engine if it is not already installed.

The installer supports automatic package installation for these distribution families:

| Distributions | Package manager |
| --- | --- |
| Ubuntu, Debian, Linux Mint, Pop!_OS | `apt` |
| Fedora, RHEL, CentOS, Rocky Linux, AlmaLinux | `dnf` |
| Arch Linux, Manjaro, EndeavourOS | `pacman` |

On other distributions, install the required dependencies manually.

## Installation

1. Clone the project and enter its directory:

   ```bash
   git clone https://github.com/R31tr0/we-linux-to-mp4.git
   cd we-linux-to-mp4
   ```
2. Run the installer:

   ```bash
   ./install.sh
   ```

   If needed, make it executable first with `chmod +x install.sh`.
3. The installer checks dependencies and asks before installing packages. System package installation may require `sudo`.
4. If necessary, it installs npm dependencies and builds `linux-wallpaperengine` from source.

The engine and its supporting files are placed in the project's `bin/` directory. This directory is created during the build and is excluded from Git.

## Usage

From the project directory, run:

```bash
node index.js
```

This remains the standard way to launch the project. To use the shorter command, run `npm link` once from the project directory, then launch it with `we-linux-to-mp4`.

Enter the path to a Wallpaper Engine `.pkg` archive. The utility lists the archive's resources. If it contains ready-made videos, you can extract one without rendering; otherwise, or if you choose not to extract one, you can render the scene.

During rendering, the utility asks for:

1. **Duration** in seconds: a positive number.
2. **Frame rate**: a positive integer passed to both the engine and the recorder.
3. **Rendering backend**:
   - **Xvfb** (default): renders on the CPU through llvmpipe; requires `xvfb-run` and `ffmpeg`.
   - **Cage headless**: experimental GPU rendering through the Cage Wayland compositor, recorded with `wf-recorder`; requires both packages.
4. **Resolution**: choose one of two Xvfb presets, `1920x1080` (default) or `1280x720`. The lower preset usually reduces CPU load. Cage uses a single fixed resolution of `1920x1080`; it cannot be changed in the prompt.
5. **Video codec**: `libopenh264` (default, CPU), NVIDIA `h264_nvenc`, or AMD `h264_vaapi`. Hardware codecs require a compatible GPU, drivers, and FFmpeg support. If the selected encoder is unavailable, the utility falls back to `libopenh264`.

Extracted videos are saved in the current directory using their archive filenames. Rendered scenes are saved as `output_scene_<random>.mp4`, where `<random>` is a random number.

If recording starts with a black frame but the wallpaper appears later, try manually increasing `XVFB_START_DELAY` or `CAGE_START_DELAY` in `videoSupport.js`. Values are in milliseconds; for example, `10000` means 10 seconds. This will not fix a black screen caused by an unsupported scene or an engine error.

## Compatibility and limitations

Rendering is performed by [`linux-wallpaperengine`](https://github.com/Almamu/linux-wallpaperengine), so compatibility depends on the features supported by that engine. This project does not replace the engine and cannot guarantee accurate rendering of every scene or support on every platform.

### Tested distributions

| Distribution | Status |
| --- | --- |
| Fedora | Tested |
| Ubuntu | Not tested yet; testers wanted |
| Arch Linux | Not tested yet; testers wanted |

Scenes with complex shaders, widgets such as visualizers, or effects rendered as separate layers may not render correctly. Unsupported shaders or widgets may result in black textures or a black screen. This is a rendering limitation, not an issue with extracting files from the archive.

AI was used to help modularize the project and work out Wayland and FFmpeg parameters; the rest of the work is my own.

## Rendering engine

The project uses [`linux-wallpaperengine`](https://github.com/Almamu/linux-wallpaperengine). The installer clones and builds that project and copies the resulting files into this project's `bin/` directory. The engine's license is determined by its own repository and is separate from this project's license.

## License

This project is distributed under the [MIT License](./LICENSE).
