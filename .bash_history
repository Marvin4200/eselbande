curl http://localhost:3001/index.php
clear
cd ~/fahrstuhl/dashboard/public
php -S 0.0.0.0:8000
sudo apt update
sudo apt install php-cli -y
clear
sudo apt install php-cli -y
cd ~/fahrstuhl/dashboard/public
php -S 0.0.0.0:8000
clear
cd ~/fahrstuhl
git pull origin main
# Server neu starten
php -S 0.0.0.0:8000
clear
cd ~/fahrstuhl/dashboard/public
php -S 0.0.0.0:8000
clear
php -S 0.0.0.0:8000
cd ~/fahrstuhl/dashboard/public
git pull origin main
php -S 0.0.0.0:8000
clear
php -S 0.0.0.0:8000
clear
cd ~/fahrstuhl/dashboard/public
git pull origin main
clear
php -S 0.0.0.0:8000
clear
php -S 0.0.0.0:8000
sudo apt install php-curl -y
clear
php -S 0.0.0.0:8000
clear
php -S 0.0.0.0:8000
clear
php -S 0.0.0.0:8000
[200~cd dashboard/public
git pull
php -S 0.0.0.0:8000~
php -S 0.0.0.0:8000
cd ~/fahrstuhl/dashboard/public
git pull
cd ~/fahrstuhl
git status
# Erstelle ein neues Git repo auf dem Server
cd ~/fahrstuhl
git init
git config user.email "bot@fahrstuhl.local"
git config user.name "Fahrstuhl Bot"
# Wenn du die URL kennst wo du gehostet hast, sonst skip
# git remote add origin <your-repo-url>
clear
cd ~/fahrstuhl
# Füge deine lokale Windows-Maschine als remote hinzu (über ssh)
git remote add local marvin@YOUR_WINDOWS_IP:/c/Users/Txxle/Desktop/fahrstuhl
# Oder initialisiere einen bare repo auf dem Server für push/pull
cd ~
mkdir -p fahrstuhl-bare.git
cd fahrstuhl-bare.git
git init --bare
git remote -v
cleart
clear
cd ~/fahrstuhl
# Füge den bare repo als remote hinzu
git remote add origin ~/fahrstuhl-bare.git
# Pull die Änderungen
git pull origin master
# Checke ob CSS aktuell ist
ls -la dashboard/public/assets/css/style.css
cat dashboard/public/assets/css/style.css | head -20
clear
# Gehe zu fahrstuhl directory
cd ~/fahrstuhl
# Gucke was dort ist
ls -la
# Gucke aktuellen status
git status
git remote -v
clear
cd ~/fahrstuhl
# Entferne alte origin
git remote remove origin
# Füge Windows als origin hinzu
git remote add origin ssh://marvin@laptop/home/marvin/fahrstuhl.git
# Checke
git remote -v
# Fetch und checkout main branch
git fetch origin
git checkout main
# oder wenn das nicht geht:
git fetch origin main:main
git checkout main
clear
cd ~/fahrstuhl
# Option 1: Clean untracked files
git clean -fd
# Dann checkout main
git checkout main
cd ~/fahrstuhl
git clean -fd
git checkout main
git log --oneline -5
clear
cd ~/fahrstuhl/dashboard/public
php -S 0.0.0.0:8000
clear
cd ~/fahrstuhl
# Checke remotes
git remote -v
# Checke status
git status
# Checke latest commits
git log --oneline -3
cd ~/fahrstuhl
git pull origin main
ls test.txt
cd ~/fahrstuhl
# Lösche test.txt
rm test.txt
# Jetzt merge/pull
git pull origin main
# Verifiziere
git log --oneline -1
cd ~/fahrstuhl
git pull origin main
clear
php -S 0.0.0.0:8000
cd ~/fahrstuhl/dashboard/public
php -S 0.0.0.0:8000
cd ~/fahrstuhl/dashboard/public
git pull origin main
# Refresh Browser - alle Seiten sollten jetzt Daten zeigen!
php -S 0.0.0.0:8000
cd ~/fahrstuhl
git pull origin main
php -S 0.0.0.0:8000
cd ~/fahrstuhl
git checkout -- dashboard/public/pages/premium.php
rm push-css.bat push-css.js sync-css.py sync-css.sh sync-dashboard.js
git pull origin main
git log --oneline -1
cd 
cd ~/fahrstuhl
cd ~/fahrstuhl/dashboard/public
php -S 0.0.0.0:8000
cd ~/fahrstuhl
git pull origin main
# Gehe zu dashboard
cd dashboard/public
# Starte PHP server
php -S 0.0.0.0:8000
cd ~/fahrstuhl
git pull origin main
# Server lädt die neuen Dateien
php -S 0.0.0.0:8000
ls
cd dashboard/
ls
cd public/
ls
php -S 0.0.0.0:8000
cd ~/fahrstuhl
git pull origin main
git checkout -- dashboard/public/assets/js/main.js
rm dashboard/public/pages/premium-api.php
git pull origin main
git log --oneline -1
pm2 restart bot
pm2 status
git pull origin main
pm2 restart bot
git checkout -- index.js
git pull origin main
git log --oneline -1
pm2 restart bot
git pull origin main
pm2 restart bot
node hooks/post-push-webhook.js
pm2 restart bot
node hooks/post-push-webhook.js
clear
cd ~/fahrstuhl/dashboard/public
php -S 0.0.0.0:8000
pm2 list
pm2 stop 1
pm2 delete 1
php -S 0.0.0.0:8000
clear
php -S 0.0.0.0:8000
tail -50 ~/.pm2/logs/dashboard-error.log
pm2 list
pm2 stop 1
pm2 list
cat ~/fahrstuhl/data/premium.json
ls -la ~/fahrstuhl/data/
chmod 777 ~/fahrstuhl/data/
grep -A5 "file_put_contents" ~/fahrstuhl/dashboard/public/pages/premium.php
clear
cd ~/fahrstuhl && git pull origin main
pkill -f "php -S"
cd ~/fahrstuhl/dashboard/public && php -S 0.0.0.0:8000 &
pm2 logs 0
cd ~/fahrstuhl && sqlite3 data/premium.db "SELECT * FROM premium_users;"
clear
ls -la ~/fahrstuhl/data/premium.db
sqlite3 ~/fahrstuhl/data/premium.db ".schema"
cd ~/fahrstuhl && git pull origin main && pm2 restart 0
pm2 restart 0
pm2 logs
pm2 logs 0
pm2 restart 0
pm2 logs 0
clear
cd /fahrstuhl
ls
cd fahrstuhl
clear
git log --oneline -3
clear
cd ~/fahrstuhl
git pull origin main
pm2 restart all
pm2 delete 1
pm2 logs 0
cd ~/fahrstuhl
git stash
git pull origin main
pm2 restart 0
clear
pm2 logs 0
cd ~/fahrstuhl
clear
rm -f dashboard/public/dashboard-new.html dashboard/public/dashboard.html dashboard/public/premium-section.html data/premium.db utils/designSystem.js utils/notificationManager.js
git pull origin main
pm2 restart 0
git checkout data/premium.json
git pull origin main
pm2 restart 0
clear
cp data/premium.json /tmp/premium.json.bak
rm data/premium.json data/premium.db
git pull origin main
cp /tmp/premium.json.bak data/premium.json
pm2 restart 0
clear
pm2 logs 0
git pull origin main
pm2 restart 0
pm2 logs 0
clear
cd ~/fahrstuhl
git fetch origin
git reset --hard origin/main
pm2 restart 0
pm2 logs 0
clear
pm2 logs 0
clear
cat ~/fahrstuhl/data/premium.json
clear
pm2 logs 0
cat ~/fahrstuhl/data/premium.json
clear
cd ~/fahrstuhl
git log --oneline -2
cat dashboard/public/pages/premium.php | grep -A2 "expiresAt ="
cd ~/fahrstuhl && git pull origin main
cd ~/fahrstuhl
git stash
git pull origin main
pm2 restart 0
clear
cat ~/fahrstuhl/data/premium.json
cd ~/fahrstuhl/dashboard/public
pkill -f "php -S"
php -S 0.0.0.0:8000 &
php -S 0.0.0.0:8000 
clear
php -S 0.0.0.0:8000 
pm2 stop 1
lsof -i :8000
kill 23717
php -S 0.0.0.0:8000 &
pm2 stop 1
pm2 delete 1
php -S 0.0.0.0:8000 &
clear
pm2 list
pm2 stop 1
pm2 delte 1
pm2 delete 1
clear
cd ~/fahrstuhl
git pull origin main
pm2 restart all
pkill -f "php -S"
cd ~/fahrstuhl/dashboard/public && php -S 0.0.0.0:8000 &
cd ~/fahrstuhl
git stash
git pull origin main
pm2 restart 0
pm2 list
clear
cd ~/fahrstuhl/dashboard/public && php -S 0.0.0.0:8000 &
pm2 list
pm2 stop 1
cd ~/fahrstuhl/dashboard/public && php -S 0.0.0.0:8000 &
Get-Process php -ErrorAction SilentlyContinue
cd dashboard/public/
php -S localhost:8080 -t C:\Users\Txxle\Desktop\fahrstuhl\dashboard\public
php -S localhost:8080 
su
clear
pm2 list
pm2 delte all
pm2 delete all
clear
cd /home/marvin/fahrstuhl
# Einmalig: PM2 beim Booten aktivieren
pm2 startup          # Den angezeigten Befehl kopieren & ausführen
# Beide Prozesse starten
pm2 start ecosystem.config.js
# Status speichern (damit nach Reboot automatisch startet)
pm2 save
pm2 list              # Beide Prozesse sehen
pm2 logs              # Live-Logs beider Prozesse
pm2 restart all       # Beide neu starten
pm2 list
pm2 delete all
pm2 start ecosystem.config.js
clear
# .env ergänzen
echo "DEPLOY_SECRET=mein_geheimes_passwort_xyz" >> /home/marvin/fahrstuhl/.env
# Port 9000 in Firewall öffnen (wenn nötig)
ufw allow 9000
# PM2 mit dem neuen Ecosystem starten
cd /home/marvin/fahrstuhl
git pull
pm2 start ecosystem.config.js
pm2 save
clear
cd /home/marvin
# Repo klonen
git clone https://github.com/Marvin4200/FahrstuhlMain.git fahrstuhl
cd fahrstuhl
# .env anlegen (Token etc. eintragen)
nano .env
# PM2 starten
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # Den angezeigten Befehl ausführen
# Auf dem Server ausführen
curl ifconfig.me
clear
curl -4 ifconfig.me
sudo ufw allow 9000
cd /home/marvin
git clone https://github.com/Marvin4200/FahrstuhlMain.git fahrstuhl
cd fahrstuhl
clear
cd /home/marvin/fahrstuhl
git pull origin main
cd /home/marvin/fahrstuhl
# Lokale Änderungen wegwerfen und GitHub-Version nehmen
git fetch origin
git reset --hard origin/main
# .env prüfen
ls .env
npm install
pm2 start ecosystem.config.js
pm2 save
pm2 startup
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u marvin --hp /home/marvin
pm2 start ecosystem.config.js
pm2 save
pm2 list
pm2 start /home/marvin/fahrstuhl/scripts/deploy-webhook.js --name deploy-webhook
pm2 save
clear
git pull origin main
ls scripts/
git remote set-url origin https://github.com/Marvin4200/FahrstuhlMain.git
git pull origin main
ls scripts/
git remote set-url origin https://Marvin4200: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@github.com/Marvin4200/FahrstuhlMain.git
git pull origin main
# DEPLOY_SECRET in .env eintragen
echo "DEPLOY_SECRET=fahrstuhl_deploy_2024" >> /home/marvin/fahrstuhl/.env
# Deploy-Webhook starten
pm2 start /home/marvin/fahrstuhl/scripts/deploy-webhook.js --name deploy-webhook
pm2 save
# Alle 3 prüfen
pm2 list
pm2 logs deploy-webhook --lines 20
clear
pm2 logs deploy-webhook --lines 20
sudo ufw allow 9000
sudo ufw status
clear
# Firewall öffnen
sudo ufw allow 9000
sudo ufw status
# Lokal testen ob der Webhook antwortet
curl -X POST http://localhost:9000/deploy -H "Content-Type: application/json" -d '{"ref":"refs/heads/main"}'
# Deine lokale (interne) Server-IP herausfinden
hostname -I
clear
curl -X POST http://localhost:9000/deploy   -H "Content-Type: application/json"   -d '{"ref":"refs/heads/main"}'
pm2 logs deploy-webhook --lines 30
grep DEPLOY_SECRET /home/marvin/fahrstuhl/.env
pm2 logs deploy-webhook --lines 30
clear
sed -i '/DEPLOY_SECRET/d' /home/marvin/fahrstuhl/.env
echo "DEPLOY_SECRET=fahrstuhl_deploy_2024" >> /home/marvin/fahrstuhl/.env
grep DEPLOY_SECRET /home/marvin/fahrstuhl/.env
pm2 restart deploy-webhook
pm2 logs deploy-webhook --lines 30
pm2 list
pm2 logs 1
pm2 list
pm2 logs 0
pm2 logs 
npm install gtts
# ffmpeg falls nicht vorhanden:
sudo apt install ffmpeg
pm2 restart all
npm install gtts
sudo apt install ffmpeg  # falls nicht vorhanden
clear
pm2 logs
clear
cd /home/marvin/fahrstuhl
git status
cd /home/marvin/fahrstuhl
git stash && git pull origin main && git stash pop
npm install
pm2 restart fahrstuhl-bot
git stash && git pull origin main && git stash pop && pm2 restart fahrstuhl-bot
npm install  # wegen entfernter deps
pm2 restart fahrstuhl-bot
git stash && git pull origin main && git stash pop && pm2 restart fahrstuhl-bot
pm2 restart all
git stash && git pull origin main && git stash pop && npm install && pm2 restart fahrstuhl-bot
git checkout -- package.json && git pull origin main && npm install && pm2 restart fahrstuhl-bot
git merge --abort 2>/dev/null; git reset --hard HEAD && git pull origin main && npm install && pm2 restart fahrstuhl-bot
clear
git pull origin main && npm install && pm2 restart fahrstuhl-bot
pm2 logs
git pull origin main && pm2 restart dashboard
pm2 list
git pull origin main && pm2 restart dashboard-php
git pull origin main && pm2 restart dashboard
git pull origin main && pm2 restart dashboard-php
pm2 restart dashboard-php
pm2 restart fahrstuhl-bot
clear
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared && chmod +x cloudflared
clear
curl ifconfig.me
clear
curl ifconfig.me
curl -4 ifconfig.me
git pull origin main && pm2 restart fahrstuhl-bot
pm2 logs fahrstuhl-bot --lines 30 --nostream
pm2 logs 0
clear
grep TOPGG_WEBHOOK_AUTH ~/fahrstuhl/.env
clear
sed -i 's/TOPGG_WEBHOOK_AUTH=.*/TOPGG_WEBHOOK_AUTH=whs_0fc5e3c86d6d0a2b64d001972e4dc1edb7ac45fb95879b50bf0c5e551b3013cf/' ~/fahrstuhl/.env && pm2 restart fahrstuhl-bot --update-env
pm2 logs
clear
# Firewall-Status checken
sudo ufw status
# Port 3002 freigeben falls ufw aktiv
sudo ufw allow 3002/tcp
# Testen ob Port von außen erreichbar ist
curl -X POST http://62.157.1.28:3002/topgg/webhook -H "Content-Type: application/json" -H "Authorization: whs_0fc5e3c86d6d0a2b64d001972e4dc1edb7ac45fb95879b50bf0c5e551b3013cf" -d '{"user":"123","type":"upvote"}'
clear
# Von außen testen (auf dem Server eingeben):
curl -X POST http://62.157.1.28:3002/topgg/webhook   -H "Content-Type: application/json"   -H "Authorization: whs_0fc5e3c86d6d0a2b64d001972e4dc1edb7ac45fb95879b50bf0c5e551b3013cf"   -d '{"user":"123","type":"upvote"}'
# Zeig mir die lokale IP des Laptops:
hostname -I
clear
hostname
pm2 logs 0
pm2 logs fahrstuhl-bot --lines 5 --nostream
pm2 logs 0
clear
pm2 restart fahrstuhl-bot --update-env
pm2 logs 0
clear
curl -X POST http://localhost:3002/topgg/webhook   -H "Content-Type: application/json"   -H "Authorization: $(grep TOPGG_WEBHOOK_AUTH ~/fahrstuhl/.env | cut -d= -f2)"   -d '{"user":"123","type":"upvote"}'
pm2 logs 0
git pull origin main
pm2 restart all
clear
grep DISCORD_REDIRECT_URI ~/fahrstuhl/.env
# Zuerst prüfen auf welchem Port das Dashboard läuft:
pm2 list
# .env fixen
sed -i 's|DISCORD_REDIRECT_URI=.*|DISCORD_REDIRECT_URI=http://62.157.1.28:8080|' ~/fahrstuhl/.env
# Dashboard neu starten mit neuer env
pm2 restart dashboard-php --update-env
clear
pm2 logs dashboard-php --lines 5 --nostream
clear
sudo nano /etc/nginx/sites-available/fahrstuhl
clear
sudo apt install nginx -y
clear
sudo lsof -i :80
clear
sudo apt-get -o Acquire::ForceIPv4=true install nginx -y
clear
curl -4 https://google.com -I --max-time 5
pm2 list
pm2 logs
clear
sudo apt-get -o Acquire::ForceIPv4=true -o Acquire::http::No-Cache=true update && sudo apt-get -o Acquire::ForceIPv4=true install nginx -y
clear
sudo nano /etc/nginx/sites-available/fahrstuhl
sudo ln -s /etc/nginx/sites-available/fahrstuhl /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
sed -i 's|DISCORD_REDIRECT_URI=.*|DISCORD_REDIRECT_URI=http://62.157.1.28|' ~/fahrstuhl/.env && pm2 restart dashboard-php --update-env
grep DISCORD_REDIRECT_URI ~/fahrstuhl/.env
pm2 restart dashboard-php --update-env
git pull origin main
php -r "putenv('TEST=1'); echo getenv('DISCORD_REDIRECT_URI');" 
# Das zeigt nichts - PHP CLI != PHP Server
# Stattdessen direkt prüfen:
grep DISCORD_REDIRECT_URI ~/fahrstuhl/.env
clear
git pull origin main && pm2 restart dashboard-php
pm2 logs
pm2 list
curl -s http://localhost:3002/user/464387817737289758 | head -c 200
clear
pm2 status
sudo systemctl status nginx
curl -s http://localhost/ | head -c 300
sudo cat /etc/nginx/sites-available/fahrstuhl
sudo ufw status
clear
curl -s http://localhost/ | head -c 300
sudo cat /etc/nginx/sites-available/fahrstuhl
sudo ufw status
clear
sudo ufw status
sudo ss -tlnp | grep -E '80|8080|3000|3002'
clear
sudo cat /etc/nginx/sites-available/fahrstuhl
sudo sed -i 's/listen 80;/listen 8080;/' /etc/nginx/sites-available/fahrstuhl
sudo nginx -t && sudo systemctl restart nginx
# nginx config: listen 8080, proxy zu 8081
sudo sed -i 's/listen 8080;/listen 8080_TEMP;/' /etc/nginx/sites-available/fahrstuhl
sudo sed -i 's|proxy_pass http://localhost:8080;|proxy_pass http://localhost:8081;|' /etc/nginx/sites-available/fahrstuhl
sudo sed -i 's/listen 8080_TEMP;/listen 8080;/' /etc/nginx/sites-available/fahrstuhl
sudo cat /etc/nginx/sites-available/fahrstuhl
pm2 show dashboard-php | grep -i script
cat ~/fahrstuhl/ecosystem.config.js | grep -A5 dashboard
clear
# ecosystem.config.js pullen und PHP neu starten
git pull origin main
pm2 restart dashboard-php
sudo nginx -t && sudo systemctl restart nginx
curl -s http://localhost:8080/ | head -c 100
clear
pm2 delete dashboard-php
pm2 start ecosystem.config.js --only dashboard-php
sudo nginx -t && sudo systemctl restart nginx
curl -s http://localhost:8080/ | head -c 50
clear
pm2 delete dashboard-php
pm2 start ecosystem.config.js --only dashboard-php
sudo nginx -t && sudo systemctl restart nginx
curl -s http://localhost:8080/ | head -c 50
clear
git pull origin main
pm2 delete dashboard-php
pm2 start ecosystem.config.js --only dashboard-php
sudo systemctl restart nginx
curl -s http://localhost:8080/ | head -c 50
clear
sed -i 's/0.0.0.0:8080/0.0.0.0:8081/' ~/fahrstuhl/ecosystem.config.js
pm2 delete dashboard-php
pm2 start ~/fahrstuhl/ecosystem.config.js --only dashboard-php
sudo systemctl restart nginx
curl -s http://localhost:8080/ | head -c 50
clear
sudo journalctl -xeu nginx.service | tail -15
sudo ss -tlnp | grep -E ':80|:8081'
clear
sudo ss -tlnp | grep 8080
curl -s http://192.168.2.177:8080/ | head -c 50
clear
sudo cat /etc/nginx/sites-available/fahrstuhl
curl -sv http://localhost:8080/ 2>&1 | tail -20
clear
ip addr show | grep 'inet '
sudo iptables -L INPUT -n | head -20
clear
curl -sv http://192.168.2.177:8080/ 2>&1 | head -30
sudo nginx -T 2>&1 | grep -E 'server_name|listen'
pm2 list
pm2 logs
clear
sudo sed -i 's/listen 8080;/listen 80;/' /etc/nginx/sites-available/fahrstuhl
sudo nginx -t && sudo systemctl restart nginx
pm2 list
sudo ss -tlnp | grep ':80'
sudo systemctl status nginx | grep Active
curl -s http://localhost:3002/stats | python3 -m json.tool
git pull origin main
git checkout ecosystem.config.js && git pull origin main
curl -s http://localhost:3002/stats
clear
cat ~/fahrstuhl/userStats.json | head -c 200
wc -l ~/fahrstuhl/userStats.json
pm2 logs
clear
grep -n "globalStats\|userStats" ~/fahrstuhl/index.js | head -20
clear
git pull origin main && pm2 restart fahrstuhl-bot
curl -s http://localhost:3002/stats
sleep 5 && curl -s http://localhost:3002/stats
pm2 logs
clear
git pull origin main
pm2 list
pm2 logs
curl -s https://api.ipify.org
ping -c 3 8.8.8.8+
clear
ip a show wlp1s0
nmcli device status
ping -c 3 192.168.2.1
cat /etc/nginx/sites-available/eselbande.com
clear
cat /etc/nginx/sites-available/eselbande.com
clear
sudo tee /etc/nginx/sites-available/eselbande.com << 'EOF'
server {
    listen 80;
    server_name eselbande.com www.eselbande.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name eselbande.com www.eselbande.com;

    ssl_certificate /etc/letsencrypt/live/eselbande.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/eselbande.com/privkey.pem;

    root /home/marvin/landing;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    location /fahrstuhl {
        return 301 /fahrstuhl/;
    }

    location /fahrstuhl/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /eseltokens/ {
        proxy_pass http://localhost:3001/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
EOF

sudo nginx -t && sudo systemctl reload nginx
sudo sed -i 's/127.0.0.1:8080/127.0.0.1:8082/' /etc/nginx/sites-available/eselbande.com
sudo nginx -t && sudo systemctl reload nginx
Euvxeznn1
clear
sudo sed -i 's|proxy_set_header X-Real-IP \$remote_addr;|proxy_set_header X-Real-IP $remote_addr;\n        proxy_redirect / /fahrstuhl/;|' /etc/nginx/sites-available/eselbande.com
sudo nginx -t && sudo systemctl reload nginx
nano /home/marvin/fahrstuhl/dashboard/public/index.php
clear
sudo sed -i "s|header('Location: /index.php');|header('Location: /fahrstuhl/index.php');|g" /home/marvin/fahrstuhl/dashboard/public/includes/config.php
sed -i   "s|header('Location: /pages/analytics.php');|header('Location: /fahrstuhl/pages/analytics.php');|g"   /home/marvin/fahrstuhl/dashboard/public/index.php
sed -i   "s|header('Location: /pages/portal.php');|header('Location: /fahrstuhl/pages/portal.php');|g"   /home/marvin/fahrstuhl/dashboard/public/index.php
sed -i   "s|header('Location: /index.php');|header('Location: /fahrstuhl/index.php');|g"   /home/marvin/fahrstuhl/dashboard/public/index.php
sudo sed -i '/proxy_redirect \/ \/fahrstuhl\//d' /etc/nginx/sites-available/eselbande.com
sudo nginx -t && sudo systemctl reload nginx
echo '<?php header("Location: /fahrstuhl/index.php?" . $_SERVER["QUERY_STRING"]); exit();' > /home/marvin/fahrstuhl/dashboard/public/callback.php
clear
echo '<?php header("Location: /fahrstuhl/index.php?" . $_SERVER["QUERY_STRING"]); exit();' | sudo tee /home/marvin/fahrstuhl/dashboard/public/callback.php
sudo /usr/local/bin/cloudflare-ddns.sh
sudo bash -x /usr/local/bin/cloudflare-ddns.sh
curl -s --max-time 5 ifconfig.me
clear
curl -s ifconfig.me && echo
sudo systemctl status nginx --no-pager | head -5
sudo ss -tlnp | grep -E ':80|:443'
sudo /usr/local/bin/cloudflare-ddns.sh && echo "Done"
curl -v --max-time 5 http://62.157.1.28
sudo ufw status
hostname -I
clear
sudo tail -20 /var/log/php_errors.log 2>/dev/null || sudo journalctl -t php --no-pager -n 20
pm2 list
htop
clear
htop
sudo nano /usr/local/bin/cloudflare-ddns.sh
sudo chmod +x /usr/local/bin/cloudflare-ddns.sh
crontab -e
/usr/local/bin/cloudflare-ddns.sh
clear
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d eselbande.com -d www.eselbande.com
cat /etc/nginx/sites-enabled/default
clear
sudo nano /etc/nginx/sites-available/eselbande.com
sudo ln -s /etc/nginx/sites-available/eselbande.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
ls /var/www/
sudo nano /etc/nginx/sites-available/eselbande.com
sudo nginx -t
sudo systemctl reload nginx
php --version
sudo apt install php8.3-fpm -y
sudo systemctl start php8.3-fpm
sudo systemctl reload nginx
clear
sudo systemctl status nginx
sudo ss -tlnp | grep -E '80|443'
clear
sudo ufw status
sudo chmod o+x /home/marvin
sudo chmod o+x /home/marvin/fahrstuhl
sudo chmod o+x /home/marvin/fahrstuhl/dashboard
sudo chmod o+x /home/marvin/fahrstuhl/dashboard/public
clear
pm2 restart all
ls /home/marvin/fahrstuhl/dashboard/public/callback.php
find /home/marvin/fahrstuhl/dashboard -name "*.php" | grep -i callback
grep -r "redirect_uri\|callback\|oauth" /home/marvin/fahrstuhl/dashboard/public/index.php | head -20
clear
grep -r "redirect_uri\|callback\|oauth" /home/marvin/fahrstuhl/dashboard/public/index.php | head -20
clear
pm2 restart all
sudo chmod o+x /home/marvin/fahrstuhl/dashboard/public/pages
sudo chmod o+r /home/marvin/fahrstuhl/dashboard/public/pages/*.php
echo '<?php header("Location: /index.php?" . $_SERVER["QUERY_STRING"]); exit();' | sudo tee /home/marvin/fahrstuhl/dashboard/public/callback.php
clear
grep -n "client_secret" /home/marvin/fahrstuhl/dashboard/public/index.php
grep DISCORD_CLIENT_SECRET /home/marvin/fahrstuhl/.env
php -r "
\$lines = file('/home/marvin/fahrstuhl/.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
foreach (\$lines as \$line) {
    if (strpos(\$line, '=') !== false && \$line[0] !== '#') {
        list(\$key, \$value) = explode('=', \$line, 2);
        putenv(trim(\$key) . '=' . trim(\$value));
    }
}
echo getenv('DISCORD_CLIENT_SECRET');
"
clear
ls /home/marvin/fahrstuhl/dashboard/.env 2>/dev/null || echo "nicht da"
ls /home/marvin/fahrstuhl/.env 2>/dev/null || echo "nicht da"
ln -s /home/marvin/fahrstuhl/.env /home/marvin/fahrstuhl/dashboard/.env
/usr/local/bin/cloudflare-ddns.sh
clear
cat /etc/nginx/sites-available/eselbande.com
clear
sudo nano /etc/nginx/sites-available/eselbande.com
sudo chmod o+x /home/marvin/landing
sudo nginx -t && sudo systemctl reload nginx
mkdir /home/marvin/landing
chmod o+x /home/marvin/landing
/usr/local/bin/cloudflare-ddns.sh
crontab -l
clear
/usr/local/bin/cloudflare-ddns.sh && curl -s https://api.ipify.org
clear
sudo nano /etc/nginx/sites-available/eselbande.com
sudo nginx -t && sudo systemctl reload nginx
ls /run/php/
clear
sudo nano /etc/nginx/sites-available/eselbande.com
sudo nginx -t && sudo systemctl reload nginx
cd /home/marvin/fahrstuhl/dashboard/public
php -S 127.0.0.1:8080 &
clear
cd /home/marvin/fahrstuhl/dashboard/public && php -S 127.0.0.1:8080 &
php -S 127.0.0.1:8082 &
clear
pm2 logs dashboard-php --lines 30 --nostream
clear
pm2 show dashboard-php | grep -E "script|args|exec"
clear
sudo sed -i 's|proxy_pass http://127.0.0.1:8082/;|proxy_pass http://127.0.0.1:8081/;|' /etc/nginx/sites-available/eselbande.com
sudo nginx -t && sudo systemctl reload nginx
pm2 logs dashboard-php --lines 50 --nostream
sudo chown -R marvin:marvin /var/lib/php/sessions
pm2 save
pm2 startup
clear
find /home/marvin/fahrstuhl/dashboard/public -name "*.php" | xargs sudo sed -i   -e 's|href="/pages/|href="/fahrstuhl/pages/|g'   -e 's|href="/index.php|href="/fahrstuhl/index.php|g'   -e "s|header('Location: /pages/|header('Location: /fahrstuhl/pages/|g"   -e 's|action="/pages/|action="/fahrstuhl/pages/|g'   -e 's|src="/assets/|src="/fahrstuhl/assets/|g'
pm2 restart all
sudo sed -i   -e 's|href="/fahrstuhl/assets/|href="/fahrstuhl/assets/|g'   -e 's|href="/assets/|href="/fahrstuhl/assets/|g'   -e 's|href="/index.php"|href="/fahrstuhl/index.php"|g'   -e 's|href="/?logout=1"|href="/fahrstuhl/index.php?logout=1"|g'   /home/marvin/fahrstuhl/dashboard/public/includes/header.php
find /home/marvin/fahrstuhl/dashboard/public -name "*.php" | xargs sudo sed -i   -e 's|src="/assets/|src="/fahrstuhl/assets/|g'
find /home/marvin/fahrstuhl/dashboard/public -name "*.php" | xargs sudo sed -i   -e "s|fetch(\`/pages/|fetch(\`/fahrstuhl/pages/|g"   -e "s|fetch('/pages/|fetch('/fahrstuhl/pages/|g"   -e 's|fetch("/pages/|fetch("/fahrstuhl/pages/|g'   -e "s|fetch(\`/api/|fetch(\`/fahrstuhl/api/|g"   -e "s|fetch('/api/|fetch('/fahrstuhl/api/|g"   -e 's|fetch("/api/|fetch("/fahrstuhl/api/|g'
cd /home/marvin/fahrstuhl && git pull && pm2 restart fahrstuhl-bot
git pull origin main && pm2 restart fahrstuhl-bot
clear
sudo nano /etc/nginx/sites-available/eselbande.com
sudo certbot --nginx -d eselbande.com -d www.eselbande.com -d dc.eselbande.com
sudo cat /etc/nginx/sites-available/eselbande.com
clear
sudo tee /etc/nginx/sites-available/eselbande.com << 'EOF'
server {
    listen 80;
    server_name eselbande.com www.eselbande.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name eselbande.com www.eselbande.com;

    ssl_certificate /etc/letsencrypt/live/eselbande.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/eselbande.com/privkey.pem;

    root /home/marvin/landing;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    location /fahrstuhl {
        return 301 /fahrstuhl/;
    }

    location /fahrstuhl/ {
        proxy_pass http://127.0.0.1:8081/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /eseltokens/ {
        proxy_pass http://localhost:3001/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}

server {
    listen 443 ssl;
    server_name dc.eselbande.com;
    ssl_certificate /etc/letsencrypt/live/eselbande.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/eselbande.com/privkey.pem;
    return 301 https://discord.gg/2HCHH74jp7;
}
EOF

sudo nginx -t && sudo systemctl reload nginx
clear
sudo certbot --nginx -d eselbande.com -d www.eselbande.com -d dc.eselbande.com
cd /home/marvin/fahrstuhl && git pull origin main && cp landing/index.html /home/marvin/landing/index.html
git fetch origin && git reset --hard origin/main && cp landing/index.html /home/marvin/landing/index.html
clear
cd /home/marvin
unzip EselTokensV0.1.0.zip
mv EselTokensV0.1.0/eseltokens /home/marvin/eseltokens
sudo apt install unzip -y && unzip EselTokensV0.1.0.zip && mv EselTokensV0.1.0/eseltokens /home/marvin/eseltokens
clear
cat /home/marvin/eseltokens/next.config.js 2>/dev/null || cat /home/marvin/eseltokens/next.config.ts
cat > /home/marvin/eseltokens/next.config.ts << 'EOF'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/eseltokens",
  assetPrefix: "/eseltokens",
};

export default nextConfig;
EOF

node -v && npm -v
clear
cd /home/marvin/eseltokens && npm install && npm run build
npx next build
clear
chmod +x ./node_modules/.bin/next && npm run build
sed -i 's/{session\.user?\.name}/{session?.user?.name}/g' /home/marvin/eseltokens/src/app/blackjack/page.tsx
npm run build
pm2 start npm --name "eseltokens" -- start -- -p 3001
pm2 save
pm2 logs eseltokens --lines 20 --nostream
grep -r "basePath" /home/marvin/eseltokens/.next/required-server-files.json 2>/dev/null | head -5
clear
curl -s http://localhost:3001/eseltokens | head -20
clear
sudo sed -i 's|proxy_pass http://localhost:3001/;|proxy_pass http://localhost:3001;|' /etc/nginx/sites-available/eselbande.com
sudo nginx -t && sudo systemctl reload nginx
clear
cat /home/marvin/eseltokens/.env.local
clear
sed -i 's|NEXTAUTH_URL=http://localhost:3000|NEXTAUTH_URL=https://eselbande.com/eseltokens|' /home/marvin/eseltokens/.env.local
pm2 restart eseltokens
pm2 restart eseltokens --update-env
clear
sudo sed -i '/proxy_set_header Host \$host;/{/eseltokens/!b;n;a\        proxy_set_header X-Forwarded-Proto https;\n        proxy_set_header X-Forwarded-For $remote_addr;
}' /etc/nginx/sites-available/eselbande.com
sudo nano /etc/nginx/sites-available/eselbande.com
clear
sudo nano /etc/nginx/sites-available/eselbande.com
sudo tee /etc/nginx/sites-available/eselbande.com << 'EOF'
server {
    listen 80;
    server_name eselbande.com www.eselbande.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name eselbande.com www.eselbande.com;
    ssl_certificate /etc/letsencrypt/live/eselbande.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/eselbande.com/privkey.pem;

    root /home/marvin/landing;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    location /fahrstuhl {
        return 301 /fahrstuhl/;
    }

    location /fahrstuhl/ {
        proxy_pass http://127.0.0.1:8081/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /eseltokens/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}

server {
    listen 443 ssl;
    server_name dc.eselbande.com;
    ssl_certificate /etc/letsencrypt/live/eselbande.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/eselbande.com/privkey.pem;
    return 301 https://discord.gg/2HCHH74jp7;
}
EOF

sudo nginx -t && sudo systemctl reload nginx
clear
echo 'NEXTAUTH_TRUST_HOST=true' >> /home/marvin/eseltokens/.env.local
pm2 restart eseltokens --update-env
clear
cat /home/marvin/eseltokens/src/app/api/auth/\[...nextauth\]/route.ts 2>/dev/null || find /home/marvin/eseltokens/src -name "*.ts" | xargs grep -l "nextauth" | head -5
clear
find /home/marvin/eseltokens/pages -name "*.ts" -o -name "*.tsx" 2>/dev/null | head -10
cat /home/marvin/eseltokens/pages/api/auth/\[...nextauth\].ts 2>/dev/null || cat /home/marvin/eseltokens/pages/api/auth/\[...nextauth\].tsx 2>/dev/null
clear
find /home/marvin/eseltokens/src -name "*.ts" -path "*auth*" | head -10
clear
find /home/marvin/eseltokens -name "*.ts" -path "*auth*" 2>/dev/null | grep -v node_modules | grep -v .next
clear
find /home/marvin/eseltokens/src -not -path "*/node_modules/*" -not -path "*/.next/*" | head -40
clear
cat /home/marvin/eseltokens/src/lib/authOptions.js
clear
cat /home/marvin/eseltokens/src/lib/db.js
clear
pm2 logs eseltokens --lines 30 --nostream 2>&1 | tail -30
clear
pm2 logs eseltokens --lines 0
clear
curl -v http://localhost:3001/eseltokens 2>&1 | grep -E "Location|HTTP/"
clear
curl -X POST "https://api.cloudflare.com/client/v4/zones/fb4a25d41d341480659b84f09bf09f74/purge_cache"   -H "Authorization: Bearer cfut_rHHitNFbYGT8nxh2wZ5XNNdMICpXAUC44W11waad0bf92d1f"   -H "Content-Type: application/json"   --data '{"purge_everything":true}'
clear
cat /home/marvin/eseltokens/src/middleware.ts 2>/dev/null || cat /home/marvin/eseltokens/middleware.ts 2>/dev/null || cat /home/marvin/eseltokens/src/middleware.js 2>/dev/null || echo "keine middleware"
clear
find /home/marvin/eseltokens/src/app -name "page.tsx" -path "*signin*" | xargs cat 2>/dev/null | head -30
clear
cat /home/marvin/eseltokens/src/app/page.tsx | head -40
clear
curl -sI http://localhost:3001/api/auth/signin | grep -E "HTTP|Location"
curl -sI http://localhost:3001/api/auth/signin -H "Host: eselbande.com" -H "X-Forwarded-Proto: https" | grep -E "HTTP|Location"
clear
cat /home/marvin/eseltokens/package.json | grep next-auth
cat /home/marvin/eseltokens/.env.local
cat > /home/marvin/eseltokens/.env.local << 'EOF'
DISCORD_CLIENT_ID=1495529744639459528
DISCORD_CLIENT_SECRET=ytBGphteNnoLYFd4l3ePRkUNSqcLLc0T
NEXTAUTH_SECRET=eseltokens_secret_key_2026_abc123def456ghi789jkl
NEXTAUTH_URL=https://eselbande.com/eseltokens
NEXTAUTH_TRUST_HOST=true
MONGODB_URI=mongodb://localhost:27017/eseltokens
DISCORD_GUILD_ID=your_guild_id
DISCORD_MEMBER_ROLE_ID=your_member_role_id
DISCORD_ADMIN_ROLE_ID=your_admin_role_id
INITIAL_ADMIN_DISCORD_ID=your_discord_user_id
EOF

pm2 restart eseltokens --update-env
clear
curl -sI http://localhost:3001/api/auth/signin | grep -E "HTTP|Location"
sed -i 's|pages: {|basePath: "/eseltokens",\n  pages: {|' /home/marvin/eseltokens/src/lib/authOptions.js
pm2 stop eseltokens
cd /home/marvin/eseltokens
npm run build
pm2 start eseltokens --update-env
clear
sudo tee /etc/nginx/sites-available/eselbande.com << 'EOF'
server {
    listen 80;
    server_name eselbande.com www.eselbande.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name eselbande.com www.eselbande.com;
    ssl_certificate /etc/letsencrypt/live/eselbande.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/eselbande.com/privkey.pem;

    root /home/marvin/landing;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    location /fahrstuhl {
        return 301 /fahrstuhl/;
    }

    location /fahrstuhl/ {
        proxy_pass http://127.0.0.1:8081/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location ~ ^/api/auth/(.*)$ {
        return 302 /api/auth/$1;
    }

    location /eseltokens/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}

server {
    listen 443 ssl;
    server_name dc.eselbande.com;
    ssl_certificate /etc/letsencrypt/live/eselbande.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/eselbande.com/privkey.pem;
    return 301 https://discord.gg/2HCHH74jp7;
}
EOF

sudo nginx -t && sudo systemctl reload nginx
clear
sudo sed -i 's/return 302 \/eseltokens/return 307 \/eseltokens/' /etc/nginx/sites-available/eselbande.com && sudo nginx -t && sudo systemctl reload nginx
pm2 logs eseltokens --lines 30
clear
pm2 logs eseltokens --lines 50
clear
cat /home/marvin/eseltokens/src/lib/authOptions.js
find /home/marvin/eseltokens/src -path "*/auth/*" -name "*.js" -o -path "*/auth/*" -name "*.ts" | head -20
clear
cat /home/marvin/eseltokens/src/pages/api/auth/\[...nextauth\].js
clear
cat > /home/marvin/eseltokens/src/lib/authOptions.js << 'EOF'
import DiscordProvider from 'next-auth/providers/discord';
import getDb from '@/lib/db';

const authOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      authorization: {
        params: {
          scope: 'identify',
          prompt: 'none',
        },
      },
    }),
  ],
  cookies: {
    sessionToken: { name: 'next-auth.session-token', options: { httpOnly: true, sameSite: 'lax', path: '/', secure: true } },
    callbackUrl: { name: 'next-auth.callback-url', options: { sameSite: 'lax', path: '/', secure: true } },
    csrfToken: { name: 'next-auth.csrf-token', options: { httpOnly: true, sameSite: 'lax', path: '/', secure: true } },
    pkceCodeVerifier: { name: 'next-auth.pkce.code_verifier', options: { httpOnly: true, sameSite: 'lax', path: '/', secure: true, maxAge: 900 } },
    state: { name: 'next-auth.state', options: { httpOnly: true, sameSite: 'lax', path: '/', secure: true, maxAge: 900 } },
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      const db = getDb();
      const discordId = profile.id;
      const existing = db.prepare('SELECT * FROM users WHERE discordId = ?').get(discordId);
      if (existing) {
        db.prepare('UPDATE users SET username = ?, discriminator = ?, avatar = ? WHERE discordId = ?')
          .run(profile.username, profile.discriminator || '', profile.avatar || '', discordId);
      } else {
        db.prepare('INSERT INTO users (discordId, username, discriminator, avatar, role) VALUES (?, ?, ?, ?, ?)')
          .run(discordId, profile.username, profile.discriminator || '', profile.avatar || '', 'pending');
      }
      return true;
    },
    async jwt({ token, account, profile }) {
      if (profile) {
        token.discordId = profile.id;
      }
      return token;
    },
    async session({ session, token }) {
      const db = getDb();
      const user = db.prepare('SELECT * FROM users WHERE discordId = ?').get(token.discordId);
      if (user) {
        session.user.id = user.id;
        session.user.discordId = user.discordId;
        session.user.role = user.role;
        session.user.balance = user.balance;
        session.user.xp = user.xp || 0;
        session.user.name = user.username;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
};

export default authOptions;
EOF

cd /home/marvin/eseltokens && npm run build && pm2 restart eseltokens --update-env
clear
sed -i 's|NEXTAUTH_URL=https://eselbande.com/eseltokens|NEXTAUTH_URL=https://eselbande.com|' /home/marvin/eseltokens/.env.local
pm2 restart eseltokens --update-env
sed -i 's|NEXTAUTH_URL=https://eselbande.com$|NEXTAUTH_URL=https://eselbande.com/eseltokens|' /home/marvin/eseltokens/.env.local && pm2 restart eseltokens --update-env
clear
grep NEXTAUTH_URL /home/marvin/eseltokens/.env.local
clear
sed -i 's|NEXTAUTH_URL=https://eselbande.com/eseltokens|NEXTAUTH_URL=https://eselbande.com/api/auth|' /home/marvin/eseltokens/.env.local && pm2 restart eseltokens --update-env
clear
cd /home/marvin/eseltokens && npm rebuild better-sqlite3
pm2 restart eseltokens
sudo nano /etc/nginx/sites-available/eselbande.com
sudo sed -i 's|location ~ \^/api/auth/\(.*\)\$|location ~ ^/(api/auth|auth)/(.*)$|' /etc/nginx/sites-available/eselbande.com && sudo sed -i 's|return 307 /api/auth/\$1;|return 307 /eseltokens/$1/$2;|' /etc/nginx/sites-available/eselbande.com && sudo nginx -t && sudo systemctl reload nginx
sudo python3 -c "
content = open('/etc/nginx/sites-available/eselbande.com').read()
content = content.replace(
    'location ~ ^/api/auth/(.*)$ {\n        return 307 /api/auth/\$1;',
    'location ~ ^/(api/auth|auth)/(.*)$ {\n        return 307 /eseltokens/\$1/\$2;'
)
open('/etc/nginx/sites-available/eselbande.com', 'w').write(content)
" && sudo nginx -t && sudo systemctl reload nginx
clear
pm2 logs eseltokens --lines 20
find /home/marvin/eseltokens/src -name "middleware*" | xargs cat 2>/dev/null
clear
grep -A3 "cookies" /home/marvin/eseltokens/src/lib/authOptions.js | head -20
grep '"next-auth"' /home/marvin/eseltokens/package.json
clear
cat > /home/marvin/eseltokens/src/lib/authOptions.js << 'EOF'
import DiscordProvider from 'next-auth/providers/discord';
import getDb from '@/lib/db';

const authOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      authorization: {
        params: {
          scope: 'identify',
          prompt: 'none',
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      const db = getDb();
      const discordId = profile.id;
      const existing = db.prepare('SELECT * FROM users WHERE discordId = ?').get(discordId);
      if (existing) {
        db.prepare('UPDATE users SET username = ?, discriminator = ?, avatar = ? WHERE discordId = ?')
          .run(profile.username, profile.discriminator || '', profile.avatar || '', discordId);
      } else {
        db.prepare('INSERT INTO users (discordId, username, discriminator, avatar, role) VALUES (?, ?, ?, ?, ?)')
          .run(discordId, profile.username, profile.discriminator || '', profile.avatar || '', 'pending');
      }
      return true;
    },
    async jwt({ token, account, profile }) {
      if (profile) {
        token.discordId = profile.id;
      }
      return token;
    },
    async session({ session, token }) {
      const db = getDb();
      const user = db.prepare('SELECT * FROM users WHERE discordId = ?').get(token.discordId);
      if (user) {
        session.user.id = user.id;
        session.user.discordId = user.discordId;
        session.user.role = user.role;
        session.user.balance = user.balance;
        session.user.xp = user.xp || 0;
        session.user.name = user.username;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
};

export default authOptions;
EOF

rm -rf /home/marvin/eseltokens/.next && cd /home/marvin/eseltokens && npm run build && pm2 restart eseltokens --update-env
sudo python3 -c "
content = open('/etc/nginx/sites-available/eselbande.com').read()
content = content.replace('return 307 /eseltokens/\$1/\$2;', 'return 307 /eseltokens/\$1/\$2\$is_args\$args;')
open('/etc/nginx/sites-available/eselbande.com', 'w').write(content)
" && sudo nginx -t && sudo systemctl reload nginx
cleart
clear
pm2 logs eseltokens --lines 20 --nostream
clear
pm2 flush eseltokens && pm2 restart eseltokens
pm2 logs eseltokens --lines 30 --nostream
pm2 list
pm2 logs 7
cllea
clear
cat /home/marvin/eseltokens/.env.local
clear
cat > /home/marvin/eseltokens/src/lib/authOptions.js << 'EOF'
import DiscordProvider from 'next-auth/providers/discord';
import getDb from '@/lib/db';

const authOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      authorization: {
        params: { scope: 'identify', prompt: 'none' },
      },
    }),
  ],
  cookies: {
    sessionToken: {
      name: '__Secure-next-auth.session-token',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: true },
    },
    callbackUrl: {
      name: '__Secure-next-auth.callback-url',
      options: { sameSite: 'lax', path: '/', secure: true },
    },
    csrfToken: {
      name: '__Host-next-auth.csrf-token',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: true },
    },
    pkceCodeVerifier: {
      name: '__Secure-next-auth.pkce.code_verifier',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: true, maxAge: 900 },
    },
    state: {
      name: '__Secure-next-auth.state',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: true, maxAge: 900 },
    },
    nonce: {
      name: '__Secure-next-auth.nonce',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: true },
    },
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      const db = getDb();
      const discordId = profile.id;
      const existing = db.prepare('SELECT * FROM users WHERE discordId = ?').get(discordId);
      if (existing) {
        db.prepare('UPDATE users SET username = ?, discriminator = ?, avatar = ? WHERE discordId = ?')
          .run(profile.username, profile.discriminator || '', profile.avatar || '', discordId);
      } else {
        db.prepare('INSERT INTO users (discordId, username, discriminator, avatar, role) VALUES (?, ?, ?, ?, ?)')
          .run(discordId, profile.username, profile.discriminator || '', profile.avatar || '', 'pending');
      }
      return true;
    },
    async jwt({ token, account, profile }) {
      if (profile) token.discordId = profile.id;
      return token;
    },
    async session({ session, token }) {
      const db = getDb();
      const user = db.prepare('SELECT * FROM users WHERE discordId = ?').get(token.discordId);
      if (user) {
        session.user.id = user.id;
        session.user.discordId = user.discordId;
        session.user.role = user.role;
        session.user.balance = user.balance;
        session.user.xp = user.xp || 0;
        session.user.name = user.username;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
};

export default authOptions;
EOF

rm -rf /home/marvin/eseltokens/.next && cd /home/marvin/eseltokens && npm run build && pm2 restart eseltokens --update-env
clear
pm2 logs eseltokens --lines 40 --nostream
clear
sed -i 's|NEXTAUTH_URL=.*|NEXTAUTH_URL=https://eselbande.com/eseltokens|' /home/marvin/eseltokens/.env.local
sudo python3 -c "
content = open('/etc/nginx/sites-available/eselbande.com').read()
rewrite = '''    location /eseltokens/callback/ {
        rewrite ^/eseltokens/callback/(.*)\$ /api/auth/callback/\$1 last;
    }

    location /eseltokens/ {'''
content = content.replace('    location /eseltokens/ {', rewrite, 1)
open('/etc/nginx/sites-available/eselbande.com', 'w').write(content)
" && sudo nginx -t && sudo systemctl reload nginx
pm2 restart eseltokens --update-env
pm2 logs eseltokens --lines 40 --nostream
clear
pm2 logs eseltokens --lines 40 --nostream
pm2 logs eseltokens 
clear
sqlite3 /home/marvin/eseltokens/db.sqlite "UPDATE users SET role='admin' WHERE discordId='1038164719271415838';"
find /home/marvin/eseltokens -name "*.sqlite*" -o -name "*.db" 2>/dev/null
sqlite3 /home/marvin/eseltokens/eseltokens.db "UPDATE users SET role='admin' WHERE discordId='1038164719271415838'; SELECT * FROM users;"
clear
find /home/marvin/eseltokens/src/app -name "page.*" | xargs grep -l "signin\|redirect" 2>/dev/null
cat /home/marvin/eseltokens/src/app/page.tsx 2>/dev/null || cat /home/marvin/eseltokens/src/app/page.jsx
clear
cat /home/marvin/eseltokens/src/app/dashboard/page.tsx
cat /home/marvin/eseltokens/src/app/auth/signin/page.tsx
clear
sed -i "s|signIn('discord')|signIn('discord', { callbackUrl: '/eseltokens/dashboard' })|g" /home/marvin/eseltokens/src/app/auth/signin/page.tsx /home/marvin/eseltokens/src/app/page.tsx
cd /home/marvin/eseltokens && rm -rf .next && npm run build && pm2 restart eseltokens
clear
cat /etc/nginx/sites-available/eselbande.com
curl -I http://localhost:3001/eseltokens/
curl -I http://localhost:3001/eseltokens
clear
sudo python3 -c "
content = open('/etc/nginx/sites-available/eselbande.com').read()
insert = '''    location = /eseltokens {
        return 301 /eseltokens/;
    }

    location /eseltokens/callback/ {'''
content = content.replace('    location /eseltokens/callback/ {', insert, 1)
open('/etc/nginx/sites-available/eselbande.com', 'w').write(content)
" && sudo nginx -t && sudo systemctl reload nginx
clear
curl -sI https://eselbande.com/eseltokens/ -H "Host: eselbande.com"
curl -sI https://eselbande.com/eseltokens -H "Host: eselbande.com"
clear
marvin@laptop:~/eseltokens$ curl -sI https://eselbande.com/eseltokens/ -H "Host: eselbande.com"
curl -sI https://eselbande.com/eseltokens -H "Host: eselbande.com"
HTTP/2 308
date: Mon, 20 Apr 2026 20:45:06 GMT
server: cloudflare
location: /eseltokens
refresh: 0;url=/eseltokens
cf-cache-status: DYNAMIC
report-to: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=wvHSAQ9jdwkErWyKFGqR4rxxWohyUmHhAJiBkzVmrT1BSl6ldb%2BZgnA%2FXZfSM8aZqEkhZo7CBNcYfpo30p1z4zP6TtmWaBRCdSM7KG76Lx451xO%2BJn4x75JKbbAM0cQFaC0HWxW7KlxfcgUk"}]}
nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
cf-ray: 9ef6fda18f1e6317-LHR
alt-svc: h3=":443"; ma=86400
HTTP/2 301
date: Mon, 20 Apr 2026 20:45:06 GMT
content-type: text/html
location: https://eselbande.com/eseltokens/
server: cloudflare
nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
cf-cache-status: DYNAMIC
report-to: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=1WbjvF%2BJDaqPaJ%2Bl3SIgvbeEH%2FEsVj2aaaVWdy9pFvYmOlBhjVoepjlVkcMZmn3d%2BTqooDAYfiXS1gz8Vy7EkgXQkT50Uh7I7y2wFdU9i9pLynMzUx3pmci4vwcm7%2Bb7gG5fTclqBIdO%2FgkF"}]}
cf-ray: 9ef6fda31c0594a1-LHR
alt-svc: h3=":443"; ma=86400
marvin@laptop:~/eseltokens$
grep -n "basePath\|trailingSlash" /home/marvin/eseltokens/next.config.ts
sudo python3 -c "
content = open('/etc/nginx/sites-available/eselbande.com').read()
content = content.replace('''    location = /eseltokens {
        return 301 /eseltokens/;
    }

''', '')
open('/etc/nginx/sites-available/eselbande.com', 'w').write(content)
" && sudo nginx -t && sudo systemctl reload nginx
clear
sed -i 's|basePath: "/eseltokens",|basePath: "/eseltokens",\n  trailingSlash: true,|' /home/marvin/eseltokens/next.config.ts
cd /home/marvin/eseltokens && rm -rf .next && npm run build && pm2 restart eseltokens
clear
grep -rn "pending\|role.*!=\|WHERE role" /home/marvin/eseltokens/src/pages/api/admin/ /home/marvin/eseltokens/src/app/admin/ 2>/dev/null
cat /home/marvin/eseltokens/src/pages/api/admin/users.js
cat /home/marvin/eseltokens/src/pages/api/users.js
cat /home/marvin/eseltokens/src/app/admin/page.tsx
clear
cat /home/marvin/eseltokens/src/app/admin/page.tsx
clear
curl -s https://eselbande.com/eseltokens/api/admin/users -H "Cookie: $(grep -oP 'session-token.*' /dev/null)" | head
sqlite3 /home/marvin/eseltokens/eseltokens.db "SELECT id, username, role FROM users;"
cd /home/marvin/eseltokens && rm -rf .next && npm run build && pm2 restart eseltokens
sudo python3 -c "
content = open('/etc/nginx/sites-available/eselbande.com').read()
insert = '''    location /api/ {
        rewrite ^/api/(.*)\$ /eseltokens/api/\$1 last;
    }

    location ~ ^/(api/auth|auth)/(.*)\$'''
content = content.replace('    location ~ ^/(api/auth|auth)/(.*)\$', insert, 1)
open('/etc/nginx/sites-available/eselbande.com', 'w').write(content)
" && sudo nginx -t && sudo systemctl reload nginx
cd /home/marvin/fahrstuhl && git pull && cp landing/index.html /home/marvin/landing/index.html
clear
cd /home/marvin/fahrstuhl && git branch --set-upstream-to=origin/main main && git pull && cp landing/index.html /home/marvin/landing/index.html
grep DISCORD_REDIRECT_URI /home/marvin/fahrstuhl/.env
cd /home/marvin/fahrstuhl && git pull && pm2 restart dashboard-php
pm2 list
pm2 logs 0
cd /home/marvin/fahrstuhl && git pull && pm2 restart dashboard-php
pm2 restart dashboard-php --update-env
sudo python3 -c "
content = open('/etc/nginx/sites-available/eselbande.com').read()
content = content.replace(
    '    location /fahrstuhl/ {\n        proxy_pass http://127.0.0.1:8081/;\n        proxy_set_header Host \$host;\n        proxy_set_header X-Real-IP \$remote_addr;\n    }',
    '    location /fahrstuhl/ {\n        proxy_pass http://127.0.0.1:8081/;\n        proxy_set_header Host \$host;\n        proxy_set_header X-Real-IP \$remote_addr;\n        proxy_redirect / /fahrstuhl/;\n    }'
)
open('/etc/nginx/sites-available/eselbande.com', 'w').write(content)
" && sudo nginx -t && sudo systemctl reload nginx
sudo python3 -c "
content = open('/etc/nginx/sites-available/eselbande.com').read()
insert = '''    location /assets/ {
        rewrite ^/assets/(.*)\$ /fahrstuhl/assets/\$1 last;
    }

    location /fahrstuhl/ {'''
content = content.replace('    location /fahrstuhl/ {', insert, 1)
open('/etc/nginx/sites-available/eselbande.com', 'w').write(content)
" && sudo nginx -t && sudo systemctl reload nginx
clear
sudo python3 -c "
content = open('/etc/nginx/sites-available/eselbande.com').read()
insert = '''    location /assets/ {
        rewrite ^/assets/(.*)\$ /fahrstuhl/assets/\$1 last;
    }

    location /fahrstuhl/ {'''
content = content.replace('    location /fahrstuhl/ {', insert, 1)
open('/etc/nginx/sites-available/eselbande.com', 'w').write(content)
" && sudo nginx -t && sudo systemctl reload nginx
clear
grep -n "location /assets" /etc/nginx/sites-available/eselbande.com
cat /etc/nginx/sites-available/eselbande.com
lear
clear
sudo python3 -c "
content = open('/etc/nginx/sites-available/eselbande.com').read()
dup = '''    location /assets/ {
        rewrite ^/assets/(.*)\$ /fahrstuhl/assets/\$1 last;
    }

    location /assets/ {
        rewrite ^/assets/(.*)\$ /fahrstuhl/assets/\$1 last;
    }'''
single = '''    location /assets/ {
        rewrite ^/assets/(.*)\$ /fahrstuhl/assets/\$1 last;
    }'''
content = content.replace(dup, single)
open('/etc/nginx/sites-available/eselbande.com', 'w').write(content)
" && sudo nginx -t && sudo systemctl reload nginx
clear
ls /home/marvin/fahrstuhl/dashboard/public/assets/css/
sudo tail -20 /var/log/nginx/access.log | grep assets
curl -I http://127.0.0.1:8081/assets/css/style.css
sudo python3 -c "
content = open('/etc/nginx/sites-available/eselbande.com').read()
old = '''    location /assets/ {
        rewrite ^/assets/(.*)\$ /fahrstuhl/assets/\$1 last;
    }'''
new = '''    location /assets/ {
        proxy_pass http://127.0.0.1:8081/assets/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }'''
content = content.replace(old, new)
open('/etc/nginx/sites-available/eselbande.com', 'w').write(content)
" && sudo nginx -t && sudo systemctl reload nginx
cd ~/fahrstuhl && git pull && pm2 restart dashboard-php
clear
# === 1) Webserver: was läuft vor PHP? ===
sudo systemctl is-active nginx apache2 caddy 2>&1
sudo ss -tlnp | grep -E ':(80|443|8081|9000|9001|3000|3100)\s'
# === 2) nginx/Apache Configs anzeigen ===
sudo ls -la /etc/nginx/sites-enabled/ 2>/dev/null
sudo cat /etc/nginx/sites-enabled/* 2>/dev/null
sudo ls -la /etc/apache2/sites-enabled/ 2>/dev/null
sudo cat /etc/apache2/sites-enabled/*.conf 2>/dev/null
# === 3) Was läuft aktuell in PM2? ===
pm2 list
pm2 show eseltokens-webhook 2>/dev/null | head -30
# === 4) Gibts schon einen eseltokens-Ordner / User? ===
ls -la /home/ 2>/dev/null
ls -la /var/www/ 2>/dev/null
find / -maxdepth 4 -type d -name "*eseltoken*" 2>/dev/null
# === 5) Aktueller Inhalt deines eseltokens-webhook.js auf dem Server ===
cat /home/marvin/fahrstuhl/scripts/eseltokens-webhook.js 2>/dev/null | head -60
# === 6) Firewall ===
sudo ufw status 2>/dev/null
sudo iptables -L INPUT -n 2>/dev/null | head -20
# === 7) Domain / DNS (falls vorhanden) ===
curl -sI http://62.157.1.28/ | head -5
curl -sI http://62.157.1.28/fahrstuhl/ | head -5
curl -sI http://62.157.1.28/eseltokens/ | head -5
# === 8) Node version ===
node -v
npm -v
clear
# Secret generieren (kopieren!)
openssl rand -hex 32
# .env editieren
cd /home/marvin/fahrstuhl
nano .env
clear
cd /home/marvin/fahrstuhl
git pull
pm2 start ecosystem.config.js
pm2 save
pm2 logs eseltokens-webhook --lines 20
clear
cd /home/marvin/fahrstuhl
pm2 start ecosystem.config.js    # startet nur neue, ohne laufende zu stören
pm2 save
pm2 logs eseltokens-webhook --lines 20
clear
sudo nano /etc/nginx/sites-available/eselbande.com
sudo nginx -t && sudo systemctl reload nginx
curl -X POST https://eselbande.com/gh-webhook/eseltokens -d 'test'
grep ESELTOKENS_DEPLOY_SECRET /home/marvin/fahrstuhl/.env
pm2 logs eseltokens-webhook --lines 50
clear
cd /home/marvin/eseltokens
git remote -v
git status
git -C /home/marvin/eseltokens pull origin main
clear
cd /home/marvin
mv eseltokens eseltokens.backup
git clone https://github.com/Eljte/eseltokens.git eseltokens
clear
cd /home/marvin
# Falls noch nicht gemacht:
sudo apt install gh -y
gh auth login
# → GitHub.com → HTTPS → Yes (authenticate Git) → Login with a web browser
# → 8-stelligen Code kopieren, Enter, im Browser einloggen + autorisieren
# Alten Ordner wegräumen
mv eseltokens eseltokens.backup 2>/dev/null || rm -rf eseltokens
# Clone
git clone https://github.com/Eljte/eseltokens.git
cd eseltokens
# Build + Restart
npm install
npm run build
pm2 restart eseltokens --update-env
pm2 logs eseltokens --lines 20
pm2 logs eseltokens 
clear
pm2 logs eseltokens-webhook --lines 60
clear
# Läuft ein next build?
ps aux | grep -E "next build|npm run build" | grep -v grep
# Speicher
free -h
clear
tail -80 /home/marvin/fahrstuhl/logs/pm2-eseltokens-webhook-out.log
tail -40 /home/marvin/fahrstuhl/logs/pm2-eseltokens-webhook-error.log
pm2 status
clea
clear
# 1. nginx-Zugriffslog: wohin redirected es?
curl -skI https://eselbande.com/eseltokens/ | head -20
curl -skI https://eselbande.com/eseltokens | head -20
# 2. Next direkt (ohne nginx) - kommt das schon aus Next?
curl -sI http://localhost:3001/eseltokens/ | head -10
# 3. Welche NEXTAUTH_URL ist gesetzt?
grep -E "NEXTAUTH|AUTH_URL|BASE_URL|NEXT_PUBLIC" /home/marvin/eseltokens/.env* 2>/dev/null
ls -la /home/marvin/eseltokens/.env*
clear
cd /home/marvin/eseltokens
nano .env
pm2 restart eseltokens --update-env
clear
cd /home/marvin/eseltokens
ls -la .env* 2>/dev/null
grep -r "discord.com/api/oauth2/authorize\|DISCORD_CLIENT\|NEXTAUTH" --include="*.ts" --include="*.tsx" --include="*.js" src/ 2>/dev/null | head -20
pm2 logs eseltokens --err --lines 30 --nostream
clear
cd /home/marvin/eseltokens
rm -rf .next
npm run build
pm2 restart eseltokens --update-env
pm2 logs eseltokens --lines 20 --nostream
sed 's/=.*/=***/' /home/marvin/eseltokens/.env
cat /home/marvin/eseltokens/src/lib/authOptions.js
clear
grep NEXTAUTH_URL /home/marvin/eseltokens/.env
nano /home/marvin/eseltokens/.env
pm2 restart eseltokens --update-env
pm2 logs eseltokens --err --lines 20 --nostream
clear
sudo nano /etc/nginx/sites-available/eselbande.com
sudo nginx -t && sudo systemctl reload nginx
grep NEXTAUTH_URL /home/marvin/eseltokens/.env
pm2 logs eseltokens-webhook 
clear
# Beenden mit Ctrl+C, dann:
pm2 logs eseltokens-webhook --lines 10 --nostream
pm2 logs eseltokens-webhook 
clear
pm2 logs eseltokens --err --lines 40 --nostream
pm2 logs eseltokens --lines 40 --nostream | grep -i "oauth\|auth\|discord\|error" | tail -30
grep -E "NEXTAUTH_URL|NEXTAUTH_SECRET" /home/marvin/eseltokens/.env
clear
grep DISCORD_CLIENT_ID /home/marvin/eseltokens/.env
pm2 logs eseltokens 
clear
cat /home/marvin/eseltokens/.env.local
clear
nano /home/marvin/eseltokens/.env.local
pm2 restart eseltokens
nano /home/marvin/eseltokens/.env
pm2 restart eseltokens --update-env
pm2 logs eseltokens --lines 15 --nostream
clear
# Vergleich: was ist in beiden Dateien drin?
ls -la /home/marvin/eseltokens/.env*
grep -E "DISCORD_CLIENT_ID|NEXTAUTH" /home/marvin/eseltokens/.env.local 2>/dev/null
grep -E "DISCORD_CLIENT_ID|NEXTAUTH" /home/marvin/eseltokens/.env
clear
rm /home/marvin/eseltokens/.env
cd /home/marvin/eseltokens
npm run build
pm2 restart eseltokens --update-env
pm2 logs eseltokens --lines 15 --nostream
clear
grep -rn "1487187616674611321\|discord.com/oauth2\|discord.com/api/v9\|callback/discord" /home/marvin/eseltokens/src
cd /home/marvin/eseltokens && git log -3 --stat
clear
rm -f /home/marvin/eseltokens/.env
cd /home/marvin/eseltokens
npm run build
pm2 restart eseltokens --update-env
pm2 logs eseltokens --lines 15 --nostream
clear
cat /home/marvin/eseltokens/src/lib/authOptions.js
grep -rn "1487187616674611321\|callback/discord\|oauth2/authorize" /home/marvin/eseltokens/src /home/marvin/eseltokens/.next 2>/dev/null | head -20
grep -rn "signIn\|href.*discord" /home/marvin/eseltokens/src 2>/dev/null | head -30
clear
# Was kommt raus wenn man direkt den signIn-Endpoint hittet?
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n"   -X POST "https://eselbande.com/api/auth/signin/discord"   -H "Content-Type: application/x-www-form-urlencoded"   --data "csrfToken=$(curl -s https://eselbande.com/api/auth/csrf | python3 -c 'import sys,json;print(json.load(sys.stdin)[\"csrfToken\"])')"
# Runtime-Check: welche env-vars hat der laufende Prozess?
cat /proc/$(pm2 pid eseltokens 2>/dev/null)/environ 2>/dev/null | tr '\0' '\n' | grep -E "DISCORD_CLIENT|NEXTAUTH"
clear
# 1. CSRF holen
CSRF=$(curl -s https://eselbande.com/api/auth/csrf | python3 -c "import sys,json;print(json.load(sys.stdin)['csrfToken'])")
echo "CSRF: $CSRF"
# 2. signIn triggern, redirect-URL anschauen
curl -s -o /dev/null -w "HTTP=%{http_code}\nREDIRECT=%{redirect_url}\n"   -X POST "https://eselbande.com/api/auth/signin/discord"   -H "Content-Type: application/x-www-form-urlencoded"   --data "csrfToken=$CSRF"
# 3. Was hat der Prozess wirklich als ENV?
cat /proc/$(pm2 pid eseltokens)/environ 2>/dev/null | tr '\0' '\n' | grep -E "DISCORD_CLIENT|NEXTAUTH"
# 4. Providers-Endpoint
curl -s https://eselbande.com/api/auth/providers
clear
grep -r "DISCORD_CLIENT_ID\|DISCORD_CLIENT_SECRET" /home/marvin/fahrstuhl/.env 2>/dev/null
grep -r "DISCORD_CLIENT_ID\|DISCORD_CLIENT_SECRET" /home/marvin/.pm2/ 2>/dev/null | head -20
clear
# 1. Alte App löschen
pm2 delete eseltokens
# 2. Frisch aus dem richtigen Ordner starten
cd /home/marvin/eseltokens
pm2 start npm --name eseltokens -- start
# 3. Process-ENV checken - muss jetzt 1495... sein
sleep 2
cat /proc/$(pm2 pid eseltokens)/environ 2>/dev/null | tr '\0' '\n' | grep DISCORD_CLIENT_ID
# 4. Wenn korrekt: speichern
pm2 save
clear
cat /proc/$(pm2 pid eseltokens)/environ | tr '\0' '\n' | grep DISCORD_CLIENT_ID
pm2 logs eseltokens --lines 30 --nostream
pm2 status
clear
echo "PORT=3001" >> /home/marvin/eseltokens/.env.local
pm2 delete eseltokens
cd /home/marvin/eseltokens
pm2 start npm --name eseltokens -- start
pm2 logs eseltokens --lines 10 --nostream
pm2 save
lear
clear
sleep 3
pm2 logs eseltokens --lines 10 --nostream | tail -15
ss -tlnp | grep -E ':(3000|3001)\s'
clear
pm2 delete eseltokens
cd /home/marvin/eseltokens
PORT=3001 pm2 start npm --name eseltokens -- start
pm2 save
sleep 3
ss -tlnp | grep -E ':(3000|3001)\s'
clear
# 1. nginx - gibt es noch callback rewrites?
sudo grep -n "callback\|api/auth" /etc/nginx/sites-available/eselbande.com
# 2. NEXTAUTH_URL
grep NEXTAUTH_URL /home/marvin/eseltokens/.env.local
# 3. Was sendet Next.js wirklich? Prüfe beim Login-Klick die Discord-URL:
# In Chrome: F12 → Network → auf Discord-Klick achten → Location-Header
# oder URL-Leiste kopieren bevor Discord redirectet
# 1. authOptions durchsuchen nach custom redirect
grep -rn "callback/discord\|redirect_uri\|callbackUrl" /home/marvin/eseltokens/src/
# 2. Discord OAuth-URL beim Klick: nimm die URL aus der Adresszeile VOR Discord-Login
#    (oder F12 Network → discord.com/oauth2/authorize → Request-URL)
#    Poste den 'redirect_uri=' Parameter
# 1. authOptions durchsuchen nach custom redirect
grep -rn "callback/discord\|redirect_uri\|callbackUrl" /home/marvin/eseltokens/src/
# 2. Discord OAuth-URL beim Klick: nimm die URL aus der Adresszeile VOR Discord-Login
#    (oder F12 Network → discord.com/oauth2/authorize → Request-URL)
#    Poste den 'redirect_uri=' Parameter
clear
# 1. authOptions komplett lesen
cat /home/marvin/eseltokens/src/lib/authOptions.js
# 2. Alle .env Dateien
grep -H "REDIRECT\|CALLBACK" /home/marvin/eseltokens/.env* 2>/dev/null
# 3. Gibt es evtl. eine route unter /callback/?
find /home/marvin/eseltokens/src -type d -name "callback"
# 4. Gibt es middleware?
ls /home/marvin/eseltokens/src/middleware.* /home/marvin/eseltokens/middleware.* 2>/dev/null
clear
# 1. next-auth version
grep next-auth /home/marvin/eseltokens/package.json
# 2. Alle callback/discord Vorkommen (auch im Build!)
grep -rn "callback/discord" /home/marvin/eseltokens/src/ /home/marvin/eseltokens/.env.local 2>/dev/null
# 3. Im gebauten Code:
grep -rn "callback/discord" /home/marvin/eseltokens/.next/ 2>/dev/null | head -5
# 4. Und die Discord-Auth-URL aus dem Browser!
# Klick Login, kopier die URL aus der Adresszeile (discord.com/oauth2/authorize?...)
# und schick den 'redirect_uri=' Teil
# 1. nextauth API route
find /home/marvin/eseltokens/src/app/api -type f 2>/dev/null
cat /home/marvin/eseltokens/src/app/api/auth/\[...nextauth\]/route.* 2>/dev/null
# 2. Gibt es eine eigene /callback/discord route?
find /home/marvin/eseltokens/src -path "*callback*" -type f
# 3. Suche NACH "redirect_uri" in ganzem repo (nicht nur src)
grep -rn "redirect_uri\|/callback/discord" /home/marvin/eseltokens --include="*.js" --include="*.ts" --include="*.tsx" --include="*.jsx" 2>/dev/null | grep -v node_modules | grep -v .next
# 4. next.config
cat /home/marvin/eseltokens/next.config.ts
clear
# 1. nextauth API route
find /home/marvin/eseltokens/src/app/api -type f 2>/dev/null
cat /home/marvin/eseltokens/src/app/api/auth/\[...nextauth\]/route.* 2>/dev/null
# 2. Gibt es eine eigene /callback/discord route?
find /home/marvin/eseltokens/src -path "*callback*" -type f
# 3. Suche NACH "redirect_uri" in ganzem repo (nicht nur src)
grep -rn "redirect_uri\|/callback/discord" /home/marvin/eseltokens --include="*.js" --include="*.ts" --include="*.tsx" --include="*.jsx" 2>/dev/null | grep -v node_modules | grep -v .next
# 4. next.config
cat /home/marvin/eseltokens/next.config.ts
clear
sudo grep -n "callback" /etc/nginx/sites-available/eselbande.com
grep -rn "/callback/discord" /home/marvin/eseltokens/.next/
cd /home/marvin/eseltokens
rm -rf .next
npm run build
pm2 restart eseltokens
clear
ls /home/marvin/eseltokens/src/app/callback/discord*
ls /home/marvin/eseltokens/src/pages/callback/discord*
ls /home/marvin/eseltokens/middleware.* /home/marvin/eseltokens/src/middleware.* 2>/dev/null
grep -A10 "rewrites" /home/marvin/eseltokens/next.config.*
git pull
clear
cd /home/marvin/eseltokens
git pull
rm -rf .next
npm install
npm run build
pm2 restart eseltokens
clear
sudo grep -n "callback" /etc/nginx/sites-available/eselbande.com
ps aux | grep next
grep -rn "callbackUrl\\|redirect_uri\\|/callback/discord" C:/Users/Txxle/Desktop/fahrstuhl/eseltokens/src/
pm2 restart eseltokens
npm run build
pm2 restart eseltokens
clear
cat /home/marvin/eseltokens/.env.local
ls -l /home/marvin/eseltokens/.env*
cat /proc/$(pm2 pid eseltokens)/environ | tr '\0' '\n' | grep -E 'DISCORD_CLIENT|NEXTAUTH|MONGODB|PORT'
pm2 logs eseltokens --lines 50 --nostream | grep -i oauth
clear
pm2 delete eseltokens
cd /home/marvin/eseltokens
pm2 start npm --name eseltokens -- start
pm2 save
cat /proc/$(pm2 pid eseltokens)/environ | tr '\0' '\n' | grep -E 'DISCORD_CLIENT|NEXTAUTH|MONGODB|PORT'
pm2 logs 12
pm2 restart 12
pm2 logs 12
pm2 list
pm2 stop 12
pm2 delte 12
pm2 delete 12
clear
pm2 start npm --name eseltokens -- start
pm2 logs 13
clear
pm2 stop eseltokens
cd /home/marvin/eseltokens
npm run build
npm start
cd /home/marvin/eseltokens
PORT=3001 npm start
fuser -k 3001/tcp
clear
pm2 list
pm2 restart 13
clear
pm2 status
pm2 logs eseltokens --lines 30 --nostream
ss -tlnp | grep 3001
pm2 delete eseltokens
cd /home/marvin/eseltokens
PORT=3001 pm2 start npm --name eseltokens -- start
pm2 save
pm2 logs eseltokens --lines 10 --nostream
ss -tlnp | grep 3001
ls -l /home/marvin/eseltokens/.env*
grep -r "/callback/discord" .
pm2 save
pm2 startup
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u marvin --hp /home/marvin
pm2 save
reboot
su
pm2 status
pm2 restart 4
cd 
ls
cd eseltokens
grep -r "callback" .
grep -r "redirect" .
clear
grep -r "callback" .
grep -r "redirect" .
clear
grep -r "signIn" .
clear
grep -r "callback" .
grep -r "redirect" .
clear
grep -r "auth" ./src/pages
grep -r "auth" ./src/app
clear
grep -r "redirect_uri" .
rm -rf .next
npm run build
pm2 restart eseltokens
rm -rf .next
npm run build
pm2 restart eseltokens
rm -rf .next
npm run build
pm2 restart eseltokens
pm2 list
sudo systemctl status nginx
sudo systemctl restart nginx
sudo ss -tlnp | grep 443
cd 
ls
cd eseltokens
rm -rf .next
npm run build
pm2 restart eseltokens
clear
curl -i http://localhost:3001/api/auth
rm -rf .next
npm run build
pm2 restart eseltokens
rm -rf .next
npm run build
pm2 restart eseltokens
curl -i http://localhost:3001/api/auth
clear
tree src/app/api/auth/
ls -lR src/app/api/auth/
ls -l src/pages/api/auth/
clear
cat /etc/nginx/sites-available/eselbande.com
cat /etc/nginx/sites-available/default
rm -rf .next
npm run build
pm2 restart eseltokens
cd ..
mkdir elite
ls
cd ..
mkdir elite
su
pm2 list
chmod 755 marvin
chown user:marvin marvin
chown user:/home/marvin marvin
clear
whoami
pwd
ls -ld .
touch test.txt
pm2 list
pm2 stop 4
pm2 logs 4
clear
pm2 logs 4
pm2 restart 4
pm2 logs 4
cd /home/marvin/eseltokens
chmod +x node_modules/.bin/next
pm2 restart 4
pm2 logs 4
pm2 stop eseltokens
cd /home/marvin/eseltokens
npm install
npm run build
pm2 restart eseltokens
pm2 logs 4
pm2 restart eseltokens
pm2 logs 4
pm2 restart eseltokens
pm2 logs 4
grep -ri callback .
clear
grep -ri "/eseltokens/callback/discord" .
grep -ri redirect_uri .
grep -ri callbackUrl .
