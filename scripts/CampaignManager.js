const fs = require('fs');
const path = require('path');

class CampaignManager {
    constructor() {
        this.dataFile = path.join(__dirname, '..', 'campaigns.json');
        this.initializeDataFile();
    }

    // Initialiser le fichier de données s'il n'existe pas
    initializeDataFile() {
        try {
            if (!fs.existsSync(this.dataFile)) {
                const initialData = {
                    metadata: {
                        created: new Date().toISOString(),
                        lastUpdated: new Date().toISOString(),
                        version: "1.0.0"
                    },
                    campaigns: {}
                };
                fs.writeFileSync(this.dataFile, JSON.stringify(initialData, null, 2));
                console.log('📊 Fichier campaigns.json créé');
            }
        } catch (error) {
            console.error('❌ Erreur lors de l\'initialisation du fichier campaigns:', error);
        }
    }

    // Lire les données de campagnes
    readData() {
        try {
            const rawData = fs.readFileSync(this.dataFile, 'utf-8');
            return JSON.parse(rawData);
        } catch (error) {
            console.error('❌ Erreur lecture campaigns.json:', error.message);
            return {
                metadata: {
                    created: new Date().toISOString(),
                    lastUpdated: new Date().toISOString(),
                    version: "1.0.0"
                },
                campaigns: {}
            };
        }
    }

    // Sauvegarder les données de campagnes
    saveData(data) {
        try {
            data.metadata.lastUpdated = new Date().toISOString();
            fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            console.error('❌ Erreur sauvegarde campaigns.json:', error.message);
            return false;
        }
    }

    // Créer une nouvelle campagne
    createCampaign(campaignData) {
        const data = this.readData();
        
        const campaign = {
            id: campaignData.id,
            name: campaignData.name,
            source: campaignData.source,
            medium: campaignData.medium,
            description: campaignData.description,
            createdAt: new Date().toISOString(),
            visits: 0,
            lastVisit: null,
            isActive: true
        };

        data.campaigns[campaign.id] = campaign;
        
        if (this.saveData(data)) {
            console.log(`📊 Nouvelle campagne créée: ${campaign.name} (${campaign.id})`);
            return campaign;
        }
        
        throw new Error('Erreur lors de la sauvegarde de la campagne');
    }

    // Enregistrer une visite de campagne
    recordCampaignVisit(campaignId, userAgent, ip) {
        const data = this.readData();
        
        if (data.campaigns[campaignId]) {
            data.campaigns[campaignId].visits += 1;
            data.campaigns[campaignId].lastVisit = new Date().toISOString();
            
            // Optionnel: garder un historique des visites
            if (!data.campaigns[campaignId].visitHistory) {
                data.campaigns[campaignId].visitHistory = [];
            }
            
            data.campaigns[campaignId].visitHistory.push({
                timestamp: new Date().toISOString(),
                userAgent: userAgent,
                ip: ip
            });

            this.saveData(data);
            console.log(`📊 Visite enregistrée pour la campagne: ${campaignId}`);
            return data.campaigns[campaignId];
        }
        
        return null;
    }

    // Obtenir toutes les campagnes
    getAllCampaigns() {
        const data = this.readData();
        return Object.values(data.campaigns);
    }

    // Obtenir une campagne par ID
    getCampaignById(campaignId) {
        const data = this.readData();
        return data.campaigns[campaignId] || null;
    }

    // Supprimer une campagne
    deleteCampaign(campaignId) {
        const data = this.readData();
        
        if (data.campaigns[campaignId]) {
            delete data.campaigns[campaignId];
            if (this.saveData(data)) {
                console.log(`📊 Campagne supprimée: ${campaignId}`);
                return true;
            }
        }
        
        return false;
    }

    // Obtenir les statistiques des campagnes
    getCampaignStats() {
        const data = this.readData();
        const campaigns = Object.values(data.campaigns);
        
        const stats = {
            totalCampaigns: campaigns.length,
            totalVisits: campaigns.reduce((sum, c) => sum + (c.visits || 0), 0),
            todayVisits: 0,
            topSource: null
        };

        // Calculer les visites d'aujourd'hui
        const today = new Date().toDateString();
        campaigns.forEach(campaign => {
            if (campaign.visitHistory) {
                stats.todayVisits += campaign.visitHistory.filter(visit => 
                    new Date(visit.timestamp).toDateString() === today
                ).length;
            }
        });

        // Trouver la source la plus populaire
        const sourceStats = {};
        campaigns.forEach(campaign => {
            sourceStats[campaign.source] = (sourceStats[campaign.source] || 0) + (campaign.visits || 0);
        });

        if (Object.keys(sourceStats).length > 0) {
            stats.topSource = Object.keys(sourceStats).reduce((a, b) => 
                sourceStats[a] > sourceStats[b] ? a : b
            );
        }

        return stats;
    }

    // Vérifier si un ID de campagne existe
    campaignExists(campaignId) {
        const data = this.readData();
        return !!data.campaigns[campaignId];
    }
}

module.exports = CampaignManager;
