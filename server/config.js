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
        this.gmailUser = process.env.GMAIL_USER;
        this.gmailPass = process.env.GMAIL_PASS;
    }

    loadConfig() {
        try {
            this.config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'config.json'), 'utf-8'));
        } catch (error) {
            console.error('Erreur lors du chargement de la configuration:', error);
            // Configuration par défaut
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
