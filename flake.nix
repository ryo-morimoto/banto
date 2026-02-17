{
  description = "banto - task dashboard with agent integration";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      packages.${system}.default = pkgs.stdenvNoCC.mkDerivation {
        pname = "banto";
        version = "0.1.0";
        src = pkgs.lib.cleanSource ./.;
        installPhase = ''
          mkdir -p $out/share/banto
          cp -r src public $out/share/banto/
          cp package.json bun.lock tsconfig.json bunfig.toml $out/share/banto/
        '';
      };

      devShells.${system}.default =
        let
          playwrightLibs = [
            pkgs.alsa-lib
            pkgs.at-spi2-atk
            pkgs.at-spi2-core
            pkgs.atk
            pkgs.cairo
            pkgs.cups
            pkgs.dbus
            pkgs.expat
            pkgs.fontconfig
            pkgs.freetype
            pkgs.gdk-pixbuf
            pkgs.glib
            pkgs.gtk3
            pkgs.libgbm
            pkgs.libdrm
            pkgs.nspr
            pkgs.nss
            pkgs.pango
            pkgs.systemd
            pkgs.libx11
            pkgs.libxcomposite
            pkgs.libxdamage
            pkgs.libxext
            pkgs.libxfixes
            pkgs.libxrandr
            pkgs.libxcb
            pkgs.libxkbfile
            pkgs.libxkbcommon
          ];
        in
        pkgs.mkShell {
          packages = [
            pkgs.bun
            pkgs.git
          ];

          shellHook = ''
            export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath playwrightLibs}:''${LD_LIBRARY_PATH:-}"
            export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
            echo "Playwright native libs loaded for this shell"
          '';
        };

      nixosModules.default =
        {
          config,
          lib,
          pkgs,
          ...
        }:
        let
          cfg = config.services.banto;
          bantoPackage = self.packages.${pkgs.system}.default;
        in
        {
          options.services.banto = {
            enable = lib.mkEnableOption "banto task dashboard";

            port = lib.mkOption {
              type = lib.types.port;
              default = 3000;
              description = "Internal port for the banto server.";
            };

            mockRunner = lib.mkOption {
              type = lib.types.bool;
              default = false;
              description = "Whether to use the mock session runner.";
            };
          };

          config = lib.mkIf cfg.enable {
            systemd.services.banto = {
              description = "banto task dashboard";
              after = [ "network.target" ];
              wantedBy = [ "multi-user.target" ];
              restartTriggers = [ bantoPackage ];

              path = [
                pkgs.bun
                pkgs.git
                pkgs.rsync
              ];

              environment = {
                HOME = "/home/ryo-morimoto";
                BANTO_MOCK_RUNNER = if cfg.mockRunner then "1" else "";
              };

              serviceConfig = {
                Type = "simple";
                User = "ryo-morimoto";
                StateDirectory = "banto";

                ExecStartPre = pkgs.writeShellScript "banto-prepare" ''
                  mkdir -p /var/lib/banto/app
                  ${pkgs.rsync}/bin/rsync -a --delete --chmod=u+w ${bantoPackage}/share/banto/ /var/lib/banto/app/
                  cd /var/lib/banto/app
                  ${pkgs.bun}/bin/bun install --frozen-lockfile
                  ${pkgs.bun}/bin/bun build --compile --minify-whitespace --minify-syntax --target bun --outfile server src/server.ts
                '';

                ExecStart = pkgs.writeShellScript "banto-start" ''
                  cd /var/lib/banto/app
                  export NODE_ENV=production
                  export PATH="/etc/profiles/per-user/ryo-morimoto/bin:$PATH"
                  exec /var/lib/banto/app/server
                '';

                Restart = "on-failure";
                RestartSec = 5;
              };
            };

          };
        };
    };
}
