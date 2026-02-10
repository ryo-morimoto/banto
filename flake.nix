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
          cp -r src $out/share/banto/
          cp package.json bun.lock tsconfig.json $out/share/banto/
        '';
      };

      nixosModules.default =
        { config, lib, pkgs, ... }:
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
                '';

                ExecStart = pkgs.writeShellScript "banto-start" ''
                  cd /var/lib/banto/app
                  export NODE_ENV=production
                  exec ${pkgs.bun}/bin/bun run src/server.ts
                '';

                Restart = "on-failure";
                RestartSec = 5;
              };
            };


          };
        };
    };
}
