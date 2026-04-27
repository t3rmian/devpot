{
  description = "devpot dev shell - Node 16 + pnpm via corepack";

  # nodejs_16 was retired from later nixpkgs channels as EOL;
  # nixos-23.05 is the last stable channel that still packages
  # it (16.20.x LTS, same major as the 16.18.1 pin recorded in
  # .tool-versions).
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-23.05";
  };

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      # Node 16 is past upstream EOL (2023-09); nixpkgs flags it as
      # insecure. We acknowledge it explicitly here rather than
      # bumping the runtime, because react-static 7.x and the rest
      # of the dependency tree are pinned to that line.
      pkgs = import nixpkgs {
        inherit system;
        config.permittedInsecurePackages = [ "nodejs-16.20.2" ];
      };
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        buildInputs = [
          # corepack is bundled with nodejs 16.10+, so pnpm is
          # materialized from package.json's `packageManager` field
          # (8.15.9) on shell entry rather than pinned in nixpkgs.
          pkgs.nodejs_16
          # Native-deps toolbelt for sharp / node-gyp and the
          # *-bin image-tool packages (gifsicle, pngquant-bin,
          # cwebp-bin, jpegtran-bin) that this project pulls in via
          # react-static + selenium. Their prebuilt binaries no
          # longer download cleanly on Node 16.20 (old `got` HTTP
          # client), so they fall back to building from source and
          # need autoconf / automake / libtool / make / nasm in
          # addition to the C toolchain stdenv already provides.
          pkgs.pkg-config
          pkgs.python3
          pkgs.vips
          pkgs.autoconf
          pkgs.automake
          pkgs.libtool
          pkgs.gnumake
          pkgs.nasm
          pkgs.zlib
          pkgs.libpng
        ];

        shellHook = ''
          # nixpkgs links nodejs_16 against the system OpenSSL,
          # which is 3.x in nixos-23.05 (upstream Node 16 ships
          # with OpenSSL 1.1). Webpack 4 - pulled in via
          # react-static 7 - hashes module IDs with MD4, dropped
          # from the OpenSSL 3 default provider. The legacy
          # provider re-enables it without downgrading the runtime.
          export NODE_OPTIONS="--openssl-legacy-provider"

          # Activate corepack and materialize the pnpm version
          # recorded in package.json's `packageManager` field on
          # first entry. COREPACK_HOME keeps the cache project-
          # local so the Nix store stays read-only.
          export COREPACK_HOME="$(pwd)/.corepack"
          export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
          mkdir -p "$COREPACK_HOME/bin"
          corepack enable --install-directory "$COREPACK_HOME/bin" >/dev/null 2>&1 || true
          export PATH="$COREPACK_HOME/bin:$PATH"

          if [ -f package.json ]; then
            PM_VERSION=$(sed -n 's/.*"packageManager"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' package.json 2>/dev/null)
            if [ -n "$PM_VERSION" ] && ! pnpm --version >/dev/null 2>&1; then
              echo "corepack: preparing $PM_VERSION ..."
              corepack prepare "$PM_VERSION" --activate >/dev/null 2>&1 || true
            fi
          fi

          echo "node $(node --version) | pnpm $(pnpm --version 2>/dev/null || echo unavailable)"
        '';
      };
    };
}
