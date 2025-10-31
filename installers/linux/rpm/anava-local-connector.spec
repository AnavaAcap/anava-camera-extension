Name:           anava-local-connector
Version:        2.0.0
Release:        1%{?dist}
Summary:        Anava Local Connector for Chrome Extension

License:        MIT
URL:            https://anava.cloud
Source0:        %{name}-%{version}.tar.gz

BuildRequires:  golang >= 1.21
Requires:       systemd

%description
Provides local network access for camera deployment and management.
This connector enables the Anava Chrome extension to communicate with
cameras on your local network without browser security restrictions.

%prep
%setup -q

%build
go build -o local-connector ./cmd/local-connector

%install
rm -rf $RPM_BUILD_ROOT

# Install binary
mkdir -p $RPM_BUILD_ROOT/opt/anava/local-connector
install -m 0755 local-connector $RPM_BUILD_ROOT/opt/anava/local-connector/local-connector

%files
/opt/anava/local-connector/local-connector

%post
# Get the user who invoked sudo
REAL_USER="${SUDO_USER:-$USER}"
USER_HOME=$(getent passwd "$REAL_USER" | cut -d: -f6)

# Create systemd user service directory
SYSTEMD_USER_DIR="${USER_HOME}/.config/systemd/user"
mkdir -p "${SYSTEMD_USER_DIR}"

# Create systemd user service file
cat > "${SYSTEMD_USER_DIR}/anava-local-connector.service" <<EOF
[Unit]
Description=Anava Local Connector Proxy Service
After=network.target

[Service]
Type=simple
ExecStart=/opt/anava/local-connector/local-connector --proxy-service
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF

# Create native messaging host manifest
NATIVE_MESSAGING_DIR="${USER_HOME}/.config/google-chrome/NativeMessagingHosts"
mkdir -p "${NATIVE_MESSAGING_DIR}"

cat > "${NATIVE_MESSAGING_DIR}/com.anava.local_connector.json" <<EOF
{
  "name": "com.anava.local_connector",
  "description": "Anava Local Connector for camera network access",
  "path": "/opt/anava/local-connector/local-connector",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://gjmomjeppelbbhcmjhnajlbmohogmigi/"
  ]
}
EOF

# Set ownership
chown -R "${REAL_USER}:${REAL_USER}" "${SYSTEMD_USER_DIR}"
chown -R "${REAL_USER}:${REAL_USER}" "${NATIVE_MESSAGING_DIR}"

# Enable and start service
sudo -u "${REAL_USER}" systemctl --user daemon-reload
sudo -u "${REAL_USER}" systemctl --user enable anava-local-connector.service
sudo -u "${REAL_USER}" systemctl --user start anava-local-connector.service

echo "Anava Local Connector installed and started successfully"

%postun
# Stop and disable service on uninstall
REAL_USER="${SUDO_USER:-$USER}"
sudo -u "${REAL_USER}" systemctl --user stop anava-local-connector.service 2>/dev/null || true
sudo -u "${REAL_USER}" systemctl --user disable anava-local-connector.service 2>/dev/null || true

%changelog
* Thu Jan 01 2025 Anava Technologies <support@anava.cloud> - 2.0.0-1
- Initial release with unified binary architecture
