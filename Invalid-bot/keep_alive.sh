while true; do
    curl -Is http://localhost:3000 > /dev/null
    sleep 600  # Pings every 10 minutes
done
