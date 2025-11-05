const fs = require('fs');
const path = require('path');

class UserActivityLogger {
    constructor(logsDir = 'logs') {
        this.logsDir = path.join(process.cwd(), logsDir);
        this.ensureLogsDirectory();
    }

    ensureLogsDirectory() {
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }
        // Nettoyer les vieux logs à chaque démarrage
        this.cleanOldLogs();
    }

    // Nettoie automatiquement les logs de plus de 7 jours (FIFO)
    cleanOldLogs(maxDays = 7) {
        try {
            const files = fs.readdirSync(this.logsDir);
            const logFiles = files.filter(file => file.endsWith('.log'));
            const now = new Date();
            let deletedCount = 0;

            logFiles.forEach(file => {
                try {
                    // Extraire la date du nom de fichier (YYYY-MM-DD.log)
                    const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})\.log$/);
                    if (dateMatch) {
                        const fileDate = new Date(dateMatch[1]);
                        const daysDifference = Math.floor((now - fileDate) / (1000 * 60 * 60 * 24));

                        if (daysDifference > maxDays) {
                            const filePath = path.join(this.logsDir, file);
                            fs.unlinkSync(filePath);
                            console.log(`🗑️ Log supprimé: ${file} (${daysDifference} jours)`);
                            deletedCount++;
                        }
                    }
                } catch (error) {
                    console.warn(`⚠️ Erreur lors du nettoyage du fichier ${file}:`, error.message);
                }
            });

            if (deletedCount > 0) {
                console.log(`🧹 Nettoyage terminé: ${deletedCount} fichier(s) log supprimé(s)`);
            } else {
                console.log('✨ Aucun fichier log ancien à supprimer');
            }
        } catch (error) {
            console.error('❌ Erreur lors du nettoyage automatique des logs:', error);
        }
    }

    getLogFileName(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}.log`;
    }

    getLogFilePath(date = new Date()) {
        return path.join(this.logsDir, this.getLogFileName(date));
    }

    log(userId, action, details = {}) {
        const timestamp = new Date().toISOString();
        const userAgent = details.userAgent || 'Unknown';
        const ip = details.ip || 'Unknown';
        const url = details.url || 'Unknown';
        const method = details.method || 'Unknown';

        const logEntry = {
            timestamp,
            userId,
            action,
            ip,
            userAgent,
            url,
            method,
            details: {
                ...details.extraData || {},
                // Inclure les informations de campagne si présentes
                ...(details.campaignInfo && { campaignInfo: details.campaignInfo })
            }
        };

        const logLine = JSON.stringify(logEntry) + '\n';
        const logFile = this.getLogFilePath();

        try {
            fs.appendFileSync(logFile, logLine);
        } catch (error) {
            console.error('❌ Erreur lors de l\'écriture du log:', error);
        }
    }

    getLogsForDate(date) {
        const logFile = this.getLogFilePath(date);

        if (!fs.existsSync(logFile)) {
            return [];
        }

        try {
            const content = fs.readFileSync(logFile, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim());
            return lines.map(line => JSON.parse(line));
        } catch (error) {
            console.error('❌ Erreur lors de la lecture du log:', error);
            return [];
        }
    }

    getAvailableDates() {
        try {
            const files = fs.readdirSync(this.logsDir);
            return files
                .filter(file => file.endsWith('.log'))
                .map(file => file.replace('.log', ''))
                .sort()
                .reverse(); // Plus récent en premier
        } catch (error) {
            console.error('❌ Erreur lors de la lecture des fichiers de log:', error);
            return [];
        }
    }

    getUserStats(date) {
        const logs = this.getLogsForDate(date);
        const userStats = {};

        logs.forEach(log => {
            if (!userStats[log.userId]) {
                userStats[log.userId] = {
                    userId: log.userId,
                    totalActions: 0,
                    actions: {},
                    firstAction: log.timestamp,
                    lastAction: log.timestamp,
                    uniquePages: new Set(),
                    userAgent: log.userAgent,
                    ip: log.ip
                };
            }

            const userStat = userStats[log.userId];
            userStat.totalActions++;
            userStat.actions[log.action] = (userStat.actions[log.action] || 0) + 1;
            userStat.lastAction = log.timestamp;
            userStat.uniquePages.add(log.url);

            if (new Date(log.timestamp) < new Date(userStat.firstAction)) {
                userStat.firstAction = log.timestamp;
            }
        });

        // Convertir les Sets en Arrays pour la sérialisation JSON
        Object.values(userStats).forEach(stat => {
            stat.uniquePages = Array.from(stat.uniquePages);
            stat.pageCount = stat.uniquePages.length;
        });

        return userStats;
    }

    getTopActions(date, limit = 10) {
        const logs = this.getLogsForDate(date);
        const actionCounts = {};

        logs.forEach(log => {
            actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
        });

        return Object.entries(actionCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, limit)
            .map(([action, count]) => ({ action, count }));
    }

    getTrafficSources(date) {
        const logs = this.getLogsForDate(date);
        const sources = {};
        const sourceDetails = {};

        logs.forEach(log => {
            if (log.details && log.details.trafficSource) {
                const trafficSource = log.details.trafficSource;

                // Source principale
                const mainSource = trafficSource.source ||
                    trafficSource.utm_source ||
                    trafficSource.ref ||
                    'direct';

                if (!sources[mainSource]) {
                    sources[mainSource] = 0;
                    sourceDetails[mainSource] = {
                        source: mainSource,
                        campaigns: new Set(),
                        mediums: new Set(),
                        users: new Set()
                    };
                }

                sources[mainSource]++;
                sourceDetails[mainSource].users.add(log.userId);

                // Collecter les détails additionnels
                if (trafficSource.utm_campaign) {
                    sourceDetails[mainSource].campaigns.add(trafficSource.utm_campaign);
                }
                if (trafficSource.utm_medium) {
                    sourceDetails[mainSource].mediums.add(trafficSource.utm_medium);
                }
            }
        });

        // Convertir les Sets en Arrays pour la sérialisation JSON
        Object.keys(sourceDetails).forEach(source => {
            sourceDetails[source].campaigns = Array.from(sourceDetails[source].campaigns);
            sourceDetails[source].mediums = Array.from(sourceDetails[source].mediums);
            sourceDetails[source].users = Array.from(sourceDetails[source].users);
            sourceDetails[source].count = sources[source];
        });

        return {
            sources: Object.entries(sources)
                .sort(([, a], [, b]) => b - a)
                .map(([source, count]) => ({ source, count })),
            details: sourceDetails
        };
    }

    // Démarre le nettoyage automatique périodique
    startPeriodicCleanup(intervalHours = 24, maxDays = 7) {
        // Nettoyage immédiat
        this.cleanOldLogs(maxDays);

        // Programmer un nettoyage toutes les X heures
        const intervalMs = intervalHours * 60 * 60 * 1000;
        setInterval(() => {
            console.log('🔄 Lancement du nettoyage périodique des logs...');
            this.cleanOldLogs(maxDays);
        }, intervalMs);

        console.log(`⏰ Nettoyage automatique programmé: toutes les ${intervalHours}h (rétention: ${maxDays} jours)`);
    }
}

module.exports = UserActivityLogger;
