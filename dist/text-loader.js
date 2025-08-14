// Script pour charger et appliquer les textes depuis texts.json
class TextLoader {
    constructor() {
        this.texts = {};
        this.loadTexts();
    }

    async loadTexts() {
        try {
            const response = await fetch('/texts.json');
            if (response.ok) {
                this.texts = await response.json();
                this.applyTexts();
            } else {
                console.warn('Impossible de charger texts.json, utilisation des textes par défaut');
            }
        } catch (error) {
            console.warn('Erreur lors du chargement de texts.json:', error);
        }
    }

    applyTexts() {
        // Page d'accueil (index.html)
        if (document.querySelector('#gallery-masonry')) {
            this.applyHomeTexts();
        }

        // Page À propos (about_me.html)
        if (document.querySelector('#about-content')) {
            this.applyAboutTexts();
        }

        // Page Contact (contact.html)
        if (document.querySelector('#contact-form')) {
            this.applyContactTexts();
        }

        // Footer sur toutes les pages
        this.applyFooterTexts();

        // Navigation sur toutes les pages
        this.applyNavigationTexts();

        // Meta données et titres généraux
        this.applyMetaTexts();

        // Appliquer les titres principaux sur toutes les pages
        this.applyMainTitles();
    }

    applyMainTitles() {
        if (!this.texts.main || !this.texts.main.nom) return;

        // Titre principal dans la navigation (lien vers index.html)
        const navLink = document.querySelector('a[href="index.html"].font-signika, a[href="/"].font-signika');
        if (navLink) {
            navLink.textContent = this.texts.main.nom.toUpperCase();
        }

        // Tous les éléments avec font-signika qui contiennent le nom
        const titleElements = document.querySelectorAll('.font-signika');
        titleElements.forEach(element => {
            if (element.textContent.includes('MATTIA') || element.textContent.includes('PARRINELLO')) {
                // Si c'est un lien, mettre à jour le texte directement
                if (element.tagName === 'A') {
                    element.textContent = this.texts.main.nom.toUpperCase();
                }
                // Si c'est un paragraphe avec un <b>, mettre à jour le <b>
                const boldElement = element.querySelector('b, strong');
                if (boldElement) {
                    boldElement.textContent = this.texts.main.nom.toUpperCase();
                }
                // Si c'est directement un élément bold
                if (element.tagName === 'B' || element.tagName === 'STRONG') {
                    element.textContent = this.texts.main.nom.toUpperCase();
                }
            }
        });

        // Double vérification pour tous les éléments bold qui contiennent le nom
        const boldElements = document.querySelectorAll('b, strong');
        boldElements.forEach(element => {
            if (element.textContent.includes('MATTIA') || element.textContent.includes('PARRINELLO')) {
                element.textContent = this.texts.main.nom.toUpperCase();
            }
        });
    }

    applyHomeTexts() {
        if (!this.texts.main) return;

        // Titre principal dans la navigation (en majuscules)
        const navTitles = document.querySelectorAll('.font-signika b, .font-signika strong');
        navTitles.forEach(title => {
            if (this.texts.main.nom) {
                title.textContent = this.texts.main.nom.toUpperCase();
            }
        });

        // Gros titre principal sur la page d'accueil (lien du logo)
        const logoLink = document.querySelector('a[href="/"]');
        if (logoLink && this.texts.main.nom) {
            const logoText = logoLink.querySelector('span, b, strong');
            if (logoText) {
                logoText.textContent = this.texts.main.nom.toUpperCase();
            }
        }
    }

    applyAboutTexts() {
        if (!this.texts["a propos"]) return;

        const aboutSection = document.querySelector('#about-content');
        if (!aboutSection) {
            console.log('Section #about-content non trouvée');
            return;
        }

        console.log('Section about trouvée, reconstruction complète...');

        // Approche radicale : reconstruire toute la section
        const presentationText = this.texts["a propos"].presentation || "Salut, je suis Mattia";
        const bioText = this.texts["a propos"].bio || [];

        // HTML complet pour la section
        const newHTML = `
          <div class="block md:hidden">
            <p class="text-3xl font-serif font-bold mb-1">Salut,</p>
            <p class="text-3xl font-serif font-bold mb-6">
              Je suis Mattia <span class="animate-wave">👋</span>
            </p>
          </div>
          <p class="hidden md:block text-3xl font-serif font-bold mb-6">
            ${presentationText}
            <span class="animate-wave">👋</span>
          </p>
          ${bioText.map(paragraph => `<p class="mb-4">${paragraph}</p>`).join('')}
        `;

        // Remplacer tout le contenu de la section
        aboutSection.innerHTML = newHTML;

        // Gérer l'avatar si défini
        if (this.texts["a propos"].avatar) {
            const avatarImg = document.querySelector('img[src*="Avatar"]');
            if (avatarImg) {
                avatarImg.src = this.texts["a propos"].avatar;
                console.log('Avatar mis à jour:', this.texts["a propos"].avatar);
            }
        }

        console.log(`Section reconstruite avec ${bioText.length} paragraphes`);
        console.log('Avatar configuré:', this.texts["a propos"].avatar || 'non défini');
    }

    applyContactTexts() {
        // Pour la page contact, on peut appliquer des textes dynamiques si nécessaire
        console.log('Contact texts loaded:', this.texts);
    }

    applyFooterTexts() {
        if (!this.texts.footer) return;

        // Nom dans le footer (en majuscules)
        const footerNames = document.querySelectorAll('footer .font-signika b, footer .font-signika strong');
        footerNames.forEach(footerName => {
            if (this.texts.main && this.texts.main.nom) {
                footerName.textContent = this.texts.main.nom.toUpperCase();
            }
        });

        // Adresse
        const footerAddress = document.querySelector('footer .text-sm.text-gray-600');
        if (footerAddress && this.texts.footer.ligne1 && this.texts.footer.ligne2) {
            footerAddress.innerHTML = `${this.texts.footer.ligne1}<br />${this.texts.footer.ligne2}`;
        }

        // Lien Instagram
        const instagramLink = document.querySelector('footer a[href*="instagram"]');
        if (instagramLink && this.texts.footer.instagram) {
            instagramLink.href = `https://www.instagram.com/${this.texts.footer.instagram}`;
        }

        // Ajouter ou mettre à jour la signature avec lien GitHub
        this.addSignatureToFooter();
    }

    addSignatureToFooter() {
        const footer = document.querySelector('footer');
        if (!footer) return;

        // Chercher si la signature existe déjà
        let signatureElement = footer.querySelector('.footer-signature');

        if (!signatureElement) {
            // Créer l'élément signature
            signatureElement = document.createElement('div');
            signatureElement.className = 'footer-signature text-center mt-8 pt-8 border-t border-gray-200 dark:border-gray-700';

            const footerContainer = footer.querySelector('.max-w-screen-xl');
            if (footerContainer) {
                footerContainer.appendChild(signatureElement);
            }
        }

        // Utiliser des valeurs fixes pour la signature
        const signature = "Codé avec ❤️ par Mattia PARRINELLO";
        const githubUrl = "https://github.com/MattiaPARRINELLO";

        signatureElement.innerHTML = `
            <p class="text-sm text-gray-500 dark:text-gray-400">
                <a href="${githubUrl}" target="_blank" rel="noopener noreferrer" 
                   class="hover:text-gray-700 dark:hover:text-gray-200 transition duration-300">
                    ${signature}
                </a>
            </p>
        `;
    }

    applyNavigationTexts() {
        // Les liens de navigation sont déjà corrects, mais on pourrait les rendre dynamiques
        // si nécessaire dans le futur
    }

    applyMetaTexts() {
        if (!this.texts.main) return;

        // Titre de la page dans l'onglet
        const title = document.querySelector('title');
        if (title && this.texts.main.nom) {
            // Adapter selon la page
            if (document.querySelector('#gallery-masonry')) {
                title.textContent = `${this.texts.main.nom.toUpperCase()} - Portfolio`;
            } else if (document.querySelector('#about-content')) {
                title.textContent = `${this.texts.main.nom.toUpperCase()} - A propos`;
            } else if (document.querySelector('#contact-form')) {
                title.textContent = `${this.texts.main.nom.toUpperCase()} - Contact`;
            }
        }

        // Mettre à jour les gros titres dans la navigation sur toutes les pages
        const allNavTitles = document.querySelectorAll('nav .font-signika b, header .font-signika b, .font-signika strong');
        allNavTitles.forEach(navTitle => {
            if (this.texts.main.nom) {
                navTitle.textContent = this.texts.main.nom.toUpperCase();
            }
        });
    }
}

// Initialiser le chargeur de textes quand le DOM est prêt
document.addEventListener('DOMContentLoaded', () => {
    new TextLoader();
});
