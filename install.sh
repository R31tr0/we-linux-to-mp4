#!/usr/bin/env bash
set -euo pipefail

#!/usr/bin/env bash

# Цвета и стили
BOLD=$(tput bold 2>/dev/null || echo "")
DIM=$(tput dim 2>/dev/null || echo "")
CYAN=$(tput setaf 6 2>/dev/null || echo "")
GREEN=$(tput setaf 2 2>/dev/null || echo "")
YELLOW=$(tput setaf 3 2>/dev/null || echo "")
RESET=$(tput sgr0 2>/dev/null || echo "")

# Очищаем экран для красоты (по желанию, можно убрать)
clear

# Красивый баннер
echo -n "${CYAN}${BOLD}"
cat << "EOF"
 __        _______   _     _                     _           __  __ ____  _  _   
 \ \      / / ____| | |   (_)_ __  _   ___  __  | |_ ___    |  \/  |  _ \| || |  
  \ \ /\ / /|  _|   | |   | | '_ \| | | \ \/ /  | __/ _ \   | |\/| | |_) | || |_ 
   \ V  V / | |___  | |___| | | | | |_| |>  <   | || (_) |  | |  | |  __/|__   _|
    \_/\_/  |_____| |_____|_|_| |_|\__,_/_/\_\   \__\___/   |_|  |_|_|      |_|  
EOF
echo -n "${RESET}"

echo -e "  ${BOLD}Добро пожаловать в установщик Wallpaper Engine Linux to MP4!${RESET}\n"
echo -e "${DIM}  Сбор информации о системе...${RESET}"

# Сбор системной информации
OS="$(uname -s)"
ARCH="$(uname -m)"
DISTRO_NAME="Неизвестно"

if [ -f /etc/os-release ]; then
    . /etc/os-release
    # Если VERSION_ID есть (Ubuntu/Debian/Fedora), пишем с версией, если нет (Arch) — только имя
    if [ -n "$VERSION_ID" ]; then
        DISTRO_NAME="$ID (версия $VERSION_ID)"
    else
        DISTRO_NAME="$ID"
    fi
fi

# Вывод красивой сводки
cat << EOF
${CYAN}┌──────────────────────────────────────────────────┐${RESET}
${CYAN}│${RESET} ${BOLD}Информация о системе:${RESET}                            ${CYAN}│${RESET}
${CYAN}├──────────────────────────────────────────────────┤${RESET}
${CYAN}│${RESET}  ОС / Ядро    : ${GREEN}${OS}${RESET}                             ${CYAN}│${RESET}
${CYAN}│${RESET}  Архитектура  : ${GREEN}${ARCH}${RESET}                           ${CYAN}│${RESET}
${CYAN}│${RESET}  Дистрибутив  : ${YELLOW}${DISTRO_NAME}${RESET}
${CYAN}└──────────────────────────────────────────────────┘${RESET}
EOF

echo "выполняется проверка зависимостей для оптимальной работы "

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENGINE_BINARY="$SCRIPT_DIR/bin/linux-wallpaperengine"

missing_commands=()
missing_libraries=()

check_command() {
    local name="$1"
    local description="$2"
    if command -v "$name" >/dev/null 2>&1; then
        printf "[OK] %s: %s\n" "$name" "$description"
    else
        printf "[НЕ УСТАНОВЛЕН] %s: %s\n" "$name" "$description"
        missing_commands+=("$name")
    fi
}

check_command node "Node.js для запуска index.js"
check_command npm "менеджер пакетов для readline-sync"
check_command ffmpeg "запись и обработка видео"
check_command xvfb-run "виртуальный X11-сервер для рендера сцены"
check_command ldd "проверка библиотек движка"

if [ -x "$ENGINE_BINARY" ]; then
    printf "[OK] движок найден: %s\n" "$ENGINE_BINARY"
    if command -v ldd >/dev/null 2>&1; then
        while IFS= read -r library; do
            [ -n "$library" ] && missing_libraries+=("$library")
        done < <(ldd "$ENGINE_BINARY" 2>/dev/null | awk '/not found/{print $1}')
    fi
else
    printf "[НЕ УСТАНОВЛЕН] движок не найден: %s\n" "$ENGINE_BINARY"
    check_command git "загрузка исходников движка"
    check_command cmake "сборка движка"
    check_command make "сборка движка"
fi

if [ -d "$SCRIPT_DIR/node_modules/readline-sync" ]; then
    printf "[OK] npm-зависимость: readline-sync\n"
else
    printf "[НЕ УСТАНОВЛЕН] npm-зависимость: readline-sync\n"
fi



if [ ${#missing_libraries[@]} -gt 0 ]; then
    echo "Отсутствующие системные библиотеки движка:"
    printf '  - %s\n' "${missing_libraries[@]}"
fi

if [ ${#missing_commands[@]} -eq 0 ] &&
   [ -d "$SCRIPT_DIR/node_modules/readline-sync" ] &&
   [ ${#missing_libraries[@]} -eq 0 ] &&
   [ -x "$ENGINE_BINARY" ]; then
    echo "Все ключевые зависимости проекта установлены."
    exit 0
fi

if [ ! -x "$ENGINE_BINARY" ]; then
    echo "Движок linux-wallpaperengine будет собран из исходников и установлен в bin/."
fi

read -r -p "Начать установку зависимостей и движка ? [y/N]: " response

case "${response,,}" in
    y|yes|д|да)
        if [ "$EUID" -ne 0 ] && ! command -v sudo >/dev/null 2>&1; then
            echo "Для установки системных пакетов нужен sudo."
            exit 1
        fi

        run_as_root() {
            if [ "$EUID" -eq 0 ]; then
                "$@"
            else
                sudo "$@"
            fi
        }

        case "${ID,,}" in
            ubuntu|debian|linuxmint|pop)
                echo "Устанавливаем системные зависимости через apt..."
                run_as_root apt-get update
                run_as_root apt-get install -y nodejs npm ffmpeg xvfb build-essential cmake \
                    libxrandr-dev libxinerama-dev libxcursor-dev libxi-dev libgl-dev \
                    libglew-dev freeglut3-dev libsdl2-dev liblz4-dev libavcodec-dev \
                    libavformat-dev libavutil-dev libswscale-dev libxxf86vm-dev libglm-dev \
                    libglfw3-dev libmpv-dev mpv libpulse-dev libpulse0 libfftw3-dev \
                    libfreetype-dev
                ;;
            fedora|rhel|centos|rocky|almalinux)
                echo "Устанавливаем системные зависимости через dnf..."
                run_as_root dnf install -y nodejs npm ffmpeg openh264 mozilla-openh264 xorg-x11-server-Xvfb gcc gcc-c++ \
                    cmake libXrandr-devel libXinerama-devel libXcursor-devel libXi-devel \
                    mesa-libGL-devel glew-devel freeglut-devel SDL2-devel lz4-devel \
                    ffmpeg-free-devel libXxf86vm-devel glm-devel glfw-devel mpv mpv-devel \
                    pulseaudio-libs-devel fftw-devel gmp-devel
                ;;
            arch|manjaro|endeavouros)
                echo "Устанавливаем системные зависимости через pacman..."
                run_as_root pacman -Sy --needed --noconfirm nodejs npm ffmpeg xorg-server-xvfb \
                    base-devel cmake libxrandr libxinerama libxcursor libxi mesa glew \
                    freeglut sdl2 lz4 glm glfw mpv libpulse fftw freetype2
                ;;
            *)
                echo "Автоматическая установка не настроена для дистрибутива '$ID'."
                echo "Установите зависимости сборки linux-wallpaperengine вручную."
                ;;
        esac

        if [ ! -d "$SCRIPT_DIR/node_modules/readline-sync" ] &&
           [ -f "$SCRIPT_DIR/package.json" ] && command -v npm >/dev/null 2>&1; then
            echo "Устанавливаем npm-зависимости..."
            npm --prefix "$SCRIPT_DIR" ci
        fi

        if [ ! -x "$ENGINE_BINARY" ]; then
            for command_name in git cmake make; do
                if ! command -v "$command_name" >/dev/null 2>&1; then
                    echo "Не найдена команда '$command_name'. Установите её и запустите установщик снова."
                    exit 1
                fi
            done

            BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/linux-wallpaperengine-build.XXXXXX")"
            trap 'rm -rf -- "$BUILD_DIR"' EXIT

            echo "Загружаем исходники linux-wallpaperengine..."
            git clone --recurse-submodules \
                https://github.com/Almamu/linux-wallpaperengine.git \
                "$BUILD_DIR/source"
            echo "Собираем linux-wallpaperengine..."
            cmake -S "$BUILD_DIR/source" -B "$BUILD_DIR/source/build" \
                -DCMAKE_BUILD_TYPE=Release
            make -C "$BUILD_DIR/source/build" -j"$(getconf _NPROCESSORS_ONLN 2>/dev/null || printf '1')"

            BUILD_OUTPUT="$BUILD_DIR/source/build/output"
            if [ ! -x "$BUILD_OUTPUT/linux-wallpaperengine" ]; then
                echo "Сборка завершилась, но бинарник не найден: $BUILD_OUTPUT/linux-wallpaperengine"
                exit 1
            fi

            mkdir -p "$SCRIPT_DIR/bin"
            cp -a "$BUILD_OUTPUT/." "$SCRIPT_DIR/bin/"
            chmod +x "$ENGINE_BINARY"
            if command -v ldd >/dev/null 2>&1; then
                missing_after_build="$(ldd "$ENGINE_BINARY" 2>/dev/null | awk '/not found/{print $1}')"
                if [ -n "$missing_after_build" ]; then
                    echo "Не найдены библиотеки движка после сборки:"
                    printf '  - %s\n' "$missing_after_build"
                    exit 1
                fi
            fi
            echo "Движок установлен в $ENGINE_BINARY"
        else
            echo "Движок уже установлен в bin/; сборку пропускаем."
        fi
        ;;
    *)
        echo "Пропускаем установку зависимостей."
        ;;
esac
