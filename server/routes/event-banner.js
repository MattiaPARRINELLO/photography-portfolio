const linksService = require('../utils/linksService');

// Réponse HTTP pour l'API bandeau événement (partagée entre admin et routes publiques)
function handleEventBanner(req, res) {
    try {
        if (req.method === 'POST') {
            const { message, url, icon, days, daysUntilExpiration } = req.body || {};

            if (!message || message.trim() === '') {
                return res.status(400).json({ error: 'Le message est requis' });
            }

            const durationDays = days ?? daysUntilExpiration ?? 7;
            const config = linksService.setEventBanner(
                { message: message.trim(), url: url || '', icon: icon || 'camera' },
                durationDays
            );

            const timeRemaining = linksService.getEventTimeRemaining(config.event);
            return res.json({ success: true, event: config.event, timeRemaining });
        }

        if (req.method === 'DELETE') {
            const config = linksService.clearEventBanner();
            return res.json({ success: true, event: config.event });
        }

        // GET (ou fallback lecture)
        const config = linksService.loadLinksConfig();
        const event = config.event || { enabled: false };
        const isActive = linksService.isEventActive(event);
        const timeRemaining = linksService.getEventTimeRemaining(event);
        return res.json({ event, isActive, timeRemaining });
    } catch (error) {
        console.error('Erreur bandeau événement:', error);
        return res.status(500).json({ error: 'Erreur bandeau événement' });
    }
}

module.exports = { handleEventBanner };