#!/bin/bash
cd /Users/bigfiveabidjan/Projets/data-friday/api-datafriday-staging
node dist/main.js > /tmp/api.log 2>&1 &
echo $! > /tmp/api.pid
echo "Backend started with PID $(cat /tmp/api.pid)"
