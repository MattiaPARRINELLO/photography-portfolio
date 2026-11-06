const fs = require('fs');
const path = require('path');

class CampaignManager {
    constructor() {
        this.dataFile = path.join(__dirname, '..', 'config', 'campaigns.json');
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
    // NOTE : les visites ne sont plus comptées ici. La détection de campagne
    // est faite par le tracker client (?c, ?ref, ?utm_*) puis agrégée par
    // AnalyticsService, sur le même socle que le reste des statistiques.
    // Cette méthode est conservée pour compatibilité mais ne persiste rien :
    // elle ne stockait précédemment que des User-Agent et des IP bruts.
    recordCampaignVisit() {
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
    // NOTE : les KPI (visites, engagement, conversions) sont désormais
    // calculés par AnalyticsService à partir des signaux de session.
    // Cette méthode ne sert plus qu'à exposer un résumé de déclaration.
    getCampaignStats() {
        const data = this.readData();
        const campaigns = Object.values(data.campaigns);
        return {
            totalCampaigns: campaigns.length,
            activeCampaigns: campaigns.filter(c => c.isActive !== false).length,
            topSource: null
        };
    }

    // Vérifier si un ID de campagne existe
    campaignExists(campaignId) {
        const data = this.readData();
        return !!data.campaigns[campaignId];
    }
}

module.exports = CampaignManager;
