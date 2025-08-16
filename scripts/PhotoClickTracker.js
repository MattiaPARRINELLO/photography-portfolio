const fs = require('fs');
const path = require('path');

class PhotoClickTracker {
    constructor(dataFile = 'photo-clicks.json') {
        this.dataFile = path.join(process.cwd(), 'logs', dataFile);
        this.ensureDataFile();
    }

    ensureDataFile() {
        // Créer le dossier logs s'il n'existe pas
        const logsDir = path.dirname(this.dataFile);
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }

        // Créer le fichier de données s'il n'existe pas
        if (!fs.existsSync(this.dataFile)) {
            const initialData = {
                metadata: {
                    created: new Date().toISOString(),
                    lastUpdated: new Date().toISOString(),
                    totalClicks: 0
                },
                photos: {}
            };
            fs.writeFileSync(this.dataFile, JSON.stringify(initialData, null, 2));
            console.log('📊 Fichier photo-clicks.json créé');
        }
    }

    // Lire les données de clics
    readData() {
        try {
            const rawData = fs.readFileSync(this.dataFile, 'utf-8');
            const data = JSON.parse(rawData);
            
            // Convertir les arrays uniqueUsers en Set pour chaque photo
            if (data.photos) {
                Object.keys(data.photos).forEach(photoKey => {
                    const photo = data.photos[photoKey];
                    if (photo.uniqueUsers && Array.isArray(photo.uniqueUsers)) {
                        photo.uniqueUsers = new Set(photo.uniqueUsers);
                    } else {
                        photo.uniqueUsers = new Set();
                    }
                });
            }
            
            return data;
        } catch (error) {
            console.error('❌ Erreur lecture photo-clicks.json:', error.message);
            return {
                metadata: {
                    created: new Date().toISOString(),
                    lastUpdated: new Date().toISOString(),
                    totalClicks: 0
                },
                photos: {}
            };
        }
    }

    // Sauvegarder les données de clics
    saveData(data) {
        try {
            data.metadata.lastUpdated = new Date().toISOString();
            
            // Créer une copie pour la sauvegarde avec les Set convertis en arrays
            const dataToSave = JSON.parse(JSON.stringify(data, (key, value) => {
                if (key === 'uniqueUsers' && value instanceof Set) {
                    return Array.from(value);
                }
                return value;
            }));
            
            fs.writeFileSync(this.dataFile, JSON.stringify(dataToSave, null, 2));
            return true;
        } catch (error) {
            console.error('❌ Erreur sauvegarde photo-clicks.json:', error.message);
            return false;
        }
    }

    // Enregistrer un clic sur une photo
    recordPhotoClick(photoFilename, userId = null, additionalData = {}) {
        try {
            const data = this.readData();
            
            // Nettoyer le nom de fichier (enlever les chemins et paramètres)
            const cleanFilename = path.basename(photoFilename).split('?')[0];
            
            // Initialiser la photo si elle n'existe pas
            if (!data.photos[cleanFilename]) {
                data.photos[cleanFilename] = {
                    filename: cleanFilename,
                    totalClicks: 0,
                    firstClick: new Date().toISOString(),
                    lastClick: new Date().toISOString(),
                    uniqueUsers: new Set(),
                    clickDetails: []
                };
            }

            const photo = data.photos[cleanFilename];
            
            // S'assurer que uniqueUsers est un Set (sécurité supplémentaire)
            if (!(photo.uniqueUsers instanceof Set)) {
                photo.uniqueUsers = new Set(photo.uniqueUsers || []);
            }
            
            // Incrémenter les compteurs
            photo.totalClicks++;
            photo.lastClick = new Date().toISOString();
            data.metadata.totalClicks++;

            // Ajouter l'utilisateur unique (si fourni)
            if (userId) {
                photo.uniqueUsers.add(userId);
            }

            // Ajouter les détails du clic (garder seulement les 100 derniers)
            photo.clickDetails.push({
                timestamp: new Date().toISOString(),
                userId: userId,
                ...additionalData
            });

            // Limiter à 100 détails par photo pour éviter que le fichier devienne trop gros
            if (photo.clickDetails.length > 100) {
                photo.clickDetails = photo.clickDetails.slice(-100);
            }

            // Convertir Set en Array pour la sérialisation JSON
            photo.uniqueUsers = Array.from(photo.uniqueUsers);

            const saved = this.saveData(data);
            
            if (saved) {
                console.log(`📸 Clic enregistré: ${cleanFilename} (${photo.totalClicks} clics total)`);
            }

            // Reconvertir en Set pour usage interne
            photo.uniqueUsers = new Set(photo.uniqueUsers);

            return saved;
        } catch (error) {
            console.error('❌ Erreur enregistrement clic photo:', error.message);
            return false;
        }
    }

    // Obtenir les statistiques de toutes les photos
    getAllPhotoStats() {
        try {
            const data = this.readData();
            
            // Convertir les données pour l'affichage
            const photoStats = Object.values(data.photos).map(photo => ({
                filename: photo.filename,
                totalClicks: photo.totalClicks,
                uniqueUsers: Array.isArray(photo.uniqueUsers) ? photo.uniqueUsers.length : photo.uniqueUsers.size,
                firstClick: photo.firstClick,
                lastClick: photo.lastClick,
                clicksToday: this.getClicksForPeriod(photo.clickDetails, 1),
                clicksThisWeek: this.getClicksForPeriod(photo.clickDetails, 7),
                clicksThisMonth: this.getClicksForPeriod(photo.clickDetails, 30)
            }));

            // Trier par nombre de clics (décroissant)
            photoStats.sort((a, b) => b.totalClicks - a.totalClicks);

            return {
                metadata: data.metadata,
                totalPhotos: photoStats.length,
                totalClicks: data.metadata.totalClicks,
                photos: photoStats
            };
        } catch (error) {
            console.error('❌ Erreur récupération stats photos:', error.message);
            return {
                metadata: { totalClicks: 0 },
                totalPhotos: 0,
                totalClicks: 0,
                photos: []
            };
        }
    }

    // Obtenir les clics pour une période donnée (en jours)
    getClicksForPeriod(clickDetails, days) {
        if (!Array.isArray(clickDetails)) return 0;
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        return clickDetails.filter(click => 
            new Date(click.timestamp) >= cutoffDate
        ).length;
    }

    // Obtenir le top N des photos les plus cliquées
    getTopPhotos(limit = 10) {
        const stats = this.getAllPhotoStats();
        return stats.photos.slice(0, limit);
    }

    // Réinitialiser les statistiques (utile pour les tests ou maintenance)
    resetStats() {
        try {
            const initialData = {
                metadata: {
                    created: new Date().toISOString(),
                    lastUpdated: new Date().toISOString(),
                    totalClicks: 0,
                    resetAt: new Date().toISOString()
                },
                photos: {}
            };
            
            fs.writeFileSync(this.dataFile, JSON.stringify(initialData, null, 2));
            console.log('🔄 Statistiques photos réinitialisées');
            return true;
        } catch (error) {
            console.error('❌ Erreur réinitialisation stats:', error.message);
            return false;
        }
    }
}

module.exports = PhotoClickTracker;
