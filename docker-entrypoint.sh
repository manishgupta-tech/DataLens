
#!/bin/sh
set -eu

PORT="${PORT:-8080}"

# Configure Tomcat to use Render's assigned port
sed -i "s/port=\"8080\"/port=\"$PORT\"/" \
  "$CATALINA_HOME/conf/server.xml"

# Start Tomcat
exec catalina.sh run
