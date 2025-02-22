{ pkgs }: {
  deps = [
    pkgs.libuuid
    pkgs.cairo
    pkgs.pango
    pkgs.glib
    pkgs.gtk3
    pkgs.nodejs
    pkgs.wget  # Helps with keeping the bot alive
    pkgs.curl  # Can be used to ping itself
  ];

  # Keep the process alive
  services.forever = {
    enable = true;
    watch = ".";
  };
}
