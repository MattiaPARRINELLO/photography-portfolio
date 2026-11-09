const { translateHtml } = require('../../server/utils/i18n');

describe('translateHtml — bascule de langue', () => {
    const topLink = '<a href="?lang=en" hreflang="en" lang="en">EN</a>';
    const footerLink = `<a
              href="?lang=en"
              hreflang="en"
              lang="en"
              >English</a
            >`;

    test('en anglais, les liens de bascule ramènent au français', () => {
        const html = translateHtml(`${topLink}\n${footerLink}`, 'en');

        expect(html).toContain('<a href="?lang=fr" hreflang="fr" lang="fr">FR</a>');
        expect(html).toContain('href="?lang=fr"');
        expect(html).toContain('>Français</a');
        expect(html).not.toContain('href="?lang=en" hreflang="en" lang="en">EN');
    });

    test("les URLs de langue hors liens d'interface ne bougent pas", () => {
        const html = translateHtml(
            '<link rel="alternate" hreflang="en" href="https://www.photo.mprnl.fr/?lang=en" />',
            'en'
        );

        expect(html).toContain('href="https://www.photo.mprnl.fr/?lang=en"');
    });

    test("un lien vers l'anglais avec un autre libellé reste intact", () => {
        const html = translateHtml('<a href="?lang=en">Autre</a>', 'en');

        expect(html).toBe('<a href="?lang=en">Autre</a>');
    });

    test('en français, le HTML est rendu tel quel', () => {
        const html = `${topLink}\n${footerLink}`;

        expect(translateHtml(html, 'fr')).toBe(html);
    });
});
