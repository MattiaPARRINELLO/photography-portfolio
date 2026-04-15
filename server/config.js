const fs = require('fs');
const path = require('path');

class ServerConfig {
    constructor() {
        this.loadConfig();
        this.setupPaths();
        this.loadEnvironmentVariables();
    }

    setupPaths() {
        this.paths = {
            root: path.resolve(__dirname, '..'),
            stats: path.join(__dirname, '..', 'stats.json'),
            config: path.join(__dirname, '..', 'config', 'config.json'),
            texts: path.join(__dirname, '..', 'config', 'texts.json'),
            photos: path.join(__dirname, '..', 'photos'),
            pages: path.join(__dirname, '..', 'pages'),
            adminPages: path.join(__dirname, '..', 'pages', 'admin'),
            temp: path.join(__dirname, '..', 'temp')
        };
    }

    loadEnvironmentVariables() {
        this.port = process.env.PORT || 3000;
        this.adminPassword = process.env.ADMIN_PASSWORD;

        // Configuration SMTP
        this.smtpHost = process.env.SMTP_HOST;
        this.smtpPort = parseInt(process.env.SMTP_PORT || '465');
        this.smtpUser = process.env.SMTP_USER;
        this.smtpPass = process.env.SMTP_PASS;
    }

    loadConfig() {
        // Loading precedence:
        // 1. CONFIG_FILE env var (absolute path)
        // 2. config/config.json (tracked base)
        // 3. config/config.local.json (local overrides, ignored by git)
        // 4. config/config.json.example (fallback)
        const tryLoad = (p) => {
            try {
                if (fs.existsSync(p)) {
                    return JSON.parse(fs.readFileSync(p, 'utf-8'));
                }
            } catch (e) {
                console.warn('Could not parse config file', p, e && e.message);
            }
            return null;
        };

        let cfg = null;
        if (process.env.CONFIG_FILE) {
            cfg = tryLoad(process.env.CONFIG_FILE);
            if (cfg) {
                this.config = cfg;
                return;
            }
        }

        // Load base tracked config first
        cfg = tryLoad(path.join(__dirname, '..', 'config', 'config.json')) || tryLoad(path.join(__dirname, '..', 'config', 'config.json.example'));

        // Load local overrides (non-tracked) and shallow-merge
        const local = tryLoad(path.join(__dirname, '..', 'config', 'config.local.json')) || tryLoad(path.join(__dirname, '..', 'config', 'config.local.json.example'));
        if (cfg && local) {
            // shallow merge - local overrides base
            this.config = Object.assign({}, cfg, local);
        } else if (cfg) {
            this.config = cfg;
        } else if (local) {
            this.config = local;
        } else {
            console.warn('Aucune configuration trouvée, utilisation des valeurs par défaut');
            this.config = {
                thumbnails: {
                    width: 600,
                    height: 600,
                    quality: 90,
                    fit: 'inside',
                    withoutEnlargement: true,
                    format: 'jpeg'
                }
            };
        }
    }

    reloadConfig() {
        this.loadConfig();
        return this.config;
    }

    getPaths() {
        return this.paths;
    }

    getConfig() {
        return this.config;
    }

    getPort() {
        return this.port;
    }
}

module.exports = new ServerConfig();
