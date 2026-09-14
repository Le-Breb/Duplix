import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Language = 'en' | 'fr'

const STORAGE_KEY = 'duplix-language'

function detectSystemLanguage(): Language {
  try {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language]
    for (const l of langs) {
      if (l?.toLowerCase().startsWith('fr')) return 'fr'
    }
  } catch {
    // ignore
  }
  return 'en'
}

function loadLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'fr') return stored
  } catch {
    // ignore
  }
  return detectSystemLanguage()
}

/** BCP 47 locale to feed Intl APIs (date formatting) for the given language. */
export function localeFor(language: Language): string {
  return language === 'fr' ? 'fr-FR' : 'en-US'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Entry = string | ((...args: any[]) => string)
type Dict = Record<string, Entry>

const en = {
  'sidebar.files': 'FILES',
  'sidebar.images': 'IMAGES',
  'sidebar.imagesTitle': 'Near-duplicate photo review',
  'sidebar.dark': 'DARK',
  'sidebar.settings': 'SETTINGS',

  'home.filesTitle': 'Find duplicate files',
  'home.filesDescription':
    "Pick a folder and we'll compare every file byte for byte. Nothing moves until you say so.",
  'home.imagesTitle': 'Find similar photos',
  'home.imagesDescription':
    "Pick a folder and we'll group photos that look alike — resized, recompressed, or lightly edited copies included. Nothing moves until you say so.",
  'home.working': 'Working…',
  'home.chooseFolder': 'Choose a folder to scan…',
  'home.trashNote': 'Duplicates are sent to Trash, never erased',

  'scanning.label': 'SCANNING',
  'scanning.filesChecked': 'files checked',
  'scanning.confirmStop': 'Stop scanning? Nothing has been changed yet.',
  'scanning.stopScan': 'Stop scan',
  'scanning.keepGoing': 'Keep going',
  'scanning.cancelScan': 'Cancel scan',

  'common.moveToTrash': 'Move to Trash…',
  'common.scanAnotherFolder': 'Scan another folder',

  'results.setsCount': (n: number) => `${n.toLocaleString()} set${n === 1 ? '' : 's'} of identical files`,
  'results.summary': (scannedCount: number) =>
    `${scannedCount.toLocaleString()} files checked · biggest savings first · one copy kept in each set`,
  'results.filesToTrash': (n: number) => `${n.toLocaleString()} file${n === 1 ? '' : 's'} to Trash`,

  'groupCard.copies': (n: number, sizeEach: string) => `${n} identical copies · ${sizeEach} each`,
  'groupCard.toReclaim': 'to reclaim',
  'groupCard.keepingAll': 'KEEPING ALL',
  'groupCard.pickCopy': 'Pick the copy to keep',
  'groupCard.keepNewest': 'Keep newest',
  'groupCard.keepShortestPath': 'Keep shortest path',
  'groupCard.includeSet': 'Include this set',
  'groupCard.keepAllInSet': 'Keep all in this set',
  'groupCard.modified': (date: string, size: string) => `Modified ${date} · ${size}`,
  'groupCard.keep': 'KEEP',
  'groupCard.toTrash': '→ TRASH',

  'empty.title': 'No duplicates in this folder',
  'empty.description': (scanned: number, rootPath: string) =>
    `We checked ${scanned.toLocaleString()} files in ${rootPath}. Every one is unique.`,

  'error.title': "We couldn't scan this folder",
  'error.chooseAnother': 'Choose another folder',
  'error.tryAgain': 'Try again',

  'done.filesSent': (n: number) => `${n.toLocaleString()} file${n === 1 ? '' : 's'} sent to Trash`,
  'done.reclaimedNote': (size: string) =>
    `${size} reclaimed. Your Trash still holds them if you want them back.`,
  'done.failedIntro': (n: number) => `${n} file(s) could not be moved to Trash:`,

  'confirm.title': (n: number) => `Move ${n.toLocaleString()} file${n === 1 ? '' : 's'} to Trash`,
  'confirm.description': (size: string) =>
    `You'll reclaim ${size}. One copy of every file stays exactly where it is. The rest go to your Trash, so you can put them back any time.`,
  'confirm.filesMoved': 'Files moved',
  'confirm.filesKept': 'Files kept',
  'confirm.spaceReclaimed': 'Space reclaimed',
  'confirm.notYet': 'Not yet',
  'confirm.moving': 'Moving…',
  'confirm.moveToTrashButton': 'Move to Trash',

  'images.changeFolder': 'Change folder…',
  'images.rootWithHistory': (rootPath: string) => `${rootPath} + previously scanned folders`,
  'images.setsCount': (n: number) => `${n.toLocaleString()} set${n === 1 ? '' : 's'} of similar photos`,
  'images.groupedDescription':
    'Grouped by visual similarity, not just identical bytes — resized, recompressed, or lightly edited copies count too.',
  'images.photosToTrash': (n: number) => `${n.toLocaleString()} photo${n === 1 ? '' : 's'} to Trash`,
  'images.strict': 'STRICT',
  'images.loose': 'LOOSE',
  'images.includeOtherFolders': 'Include photos from folders scanned before, too',
  'images.resultTrashed': (n: number, size: string) =>
    `${n.toLocaleString()} photo${n === 1 ? '' : 's'} sent to Trash · ${size} reclaimed`,
  'images.dismiss': 'Dismiss',
  'images.resultFailed': (n: number) =>
    `${n.toLocaleString()} photo${n === 1 ? '' : 's'} could not be moved to Trash`,
  'images.indexing': (indexed: number, total: number) =>
    `Indexing photos… ${indexed.toLocaleString()} / ${total.toLocaleString()}`,
  'images.indexingNote': 'Only needed once per photo — future visits are instant.',
  'images.comparing': 'Comparing photos…',
  'images.noPhotosFound': 'No photos found',
  'images.noPhotosDescriptionInclude':
    "This folder (and every folder scanned before it) doesn't have any photos Duplix can decode.",
  'images.noPhotosDescription':
    'This folder doesn\'t have any photos Duplix can decode. Check "include photos from folders scanned before" to widen the search, or choose a different folder.',
  'images.noSimilarFound': 'No similar photos found at this sensitivity. Try loosening it.',

  'imageGroupCard.similarityIdentical': 'Identical',
  'imageGroupCard.similarityNearlyIdentical': 'Nearly identical',
  'imageGroupCard.similarityVerySimilar': 'Very similar',
  'imageGroupCard.similaritySimilar': 'Similar',
  'imageGroupCard.similarityLooselySimilar': 'Loosely similar',
  'imageGroupCard.similarPhotos': (n: number) => `${n} similar photo${n === 1 ? '' : 's'}`,
  'imageGroupCard.toKeep': (n: number) => ` · ${n} to keep`,
  'imageGroupCard.trashingAll': 'TRASHING ALL',
  'imageGroupCard.trashing': 'Trashing…',
  'imageGroupCard.compare': 'Compare',

  'compareModal.allWillBeTrashed': (n: number) => `${n} similar photo${n === 1 ? '' : 's'} · all will be trashed`,
  'compareModal.someToKeep': (n: number, keepCount: number) =>
    `${n} similar photo${n === 1 ? '' : 's'} · ${keepCount} to keep`,
  'compareModal.backToGrid': '← Back to grid',
  'compareModal.keepNone': 'Keep none',
  'compareModal.keepAll': 'Keep all',
  'compareModal.trashSetNow': 'Trash this set now',
  'compareModal.close': 'Close (Esc)',
  'compareModal.viewFullSize': (name: string) => `View ${name} full size`,
  'compareModal.keepChecked': 'KEEP ✓',
  'compareModal.previousPhoto': 'Previous photo',
  'compareModal.nextPhoto': 'Next photo',

  'settings.title': 'Settings',
  'settings.clearCacheTitle': 'Clear scan cache',
  'settings.clearCacheDescription':
    'Duplix remembers file hashes so re-scanning an unchanged folder is fast. Clearing the cache removes that history — nothing on disk is touched, and the next scan of any folder will re-hash everything from scratch.',
  'settings.cacheCleared': (count: number) => `Cache cleared — ${count.toLocaleString()} entries removed.`,
  'settings.clearing': 'Clearing…',
  'settings.clearCache': 'Clear cache',
  'settings.done': 'Done',
  'settings.languageTitle': 'Language',
  'settings.languageDescription': 'Choose the language Duplix displays.',
} satisfies Dict

const fr: Record<keyof typeof en, Entry> = {
  'sidebar.files': 'FICHIERS',
  'sidebar.images': 'IMAGES',
  'sidebar.imagesTitle': 'Revue des photos quasi-identiques',
  'sidebar.dark': 'SOMBRE',
  'sidebar.settings': 'RÉGLAGES',

  'home.filesTitle': 'Rechercher les fichiers en double',
  'home.filesDescription':
    "Choisissez un dossier et nous comparerons chaque fichier octet par octet. Rien ne bouge tant que vous ne le décidez pas.",
  'home.imagesTitle': 'Rechercher les photos similaires',
  'home.imagesDescription':
    "Choisissez un dossier et nous regrouperons les photos qui se ressemblent — copies redimensionnées, recompressées ou légèrement modifiées incluses. Rien ne bouge tant que vous ne le décidez pas.",
  'home.working': 'Travail en cours…',
  'home.chooseFolder': 'Choisir un dossier à analyser…',
  'home.trashNote': 'Les doublons sont envoyés à la corbeille, jamais supprimés définitivement',

  'scanning.label': 'ANALYSE EN COURS',
  'scanning.filesChecked': 'fichiers vérifiés',
  'scanning.confirmStop': "Arrêter l'analyse ? Rien n'a encore été modifié.",
  'scanning.stopScan': "Arrêter l'analyse",
  'scanning.keepGoing': 'Continuer',
  'scanning.cancelScan': "Annuler l'analyse",

  'common.moveToTrash': 'Déplacer vers la corbeille…',
  'common.scanAnotherFolder': 'Analyser un autre dossier',

  'results.setsCount': (n: number) => `${n.toLocaleString()} ensemble${n <= 1 ? '' : 's'} de fichiers identiques`,
  'results.summary': (scannedCount: number) =>
    `${scannedCount.toLocaleString()} fichiers vérifiés · plus gros gains d'abord · une copie conservée par ensemble`,
  'results.filesToTrash': (n: number) => `${n.toLocaleString()} fichier${n <= 1 ? '' : 's'} à la corbeille`,

  'groupCard.copies': (n: number, sizeEach: string) => `${n} copies identiques · ${sizeEach} chacune`,
  'groupCard.toReclaim': 'à récupérer',
  'groupCard.keepingAll': 'TOUT CONSERVÉ',
  'groupCard.pickCopy': 'Choisissez la copie à conserver',
  'groupCard.keepNewest': 'Conserver la plus récente',
  'groupCard.keepShortestPath': 'Conserver le chemin le plus court',
  'groupCard.includeSet': 'Inclure cet ensemble',
  'groupCard.keepAllInSet': 'Tout conserver dans cet ensemble',
  'groupCard.modified': (date: string, size: string) => `Modifié le ${date} · ${size}`,
  'groupCard.keep': 'CONSERVER',
  'groupCard.toTrash': '→ CORBEILLE',

  'empty.title': 'Aucun doublon dans ce dossier',
  'empty.description': (scanned: number, rootPath: string) =>
    `Nous avons vérifié ${scanned.toLocaleString()} fichiers dans ${rootPath}. Chacun est unique.`,

  'error.title': "Impossible d'analyser ce dossier",
  'error.chooseAnother': 'Choisir un autre dossier',
  'error.tryAgain': 'Réessayer',

  'done.filesSent': (n: number) => `${n.toLocaleString()} fichier${n <= 1 ? '' : 's'} envoyé${n <= 1 ? '' : 's'} à la corbeille`,
  'done.reclaimedNote': (size: string) =>
    `${size} récupérés. Votre corbeille les conserve si vous voulez les récupérer.`,
  'done.failedIntro': (n: number) => `${n} fichier(s) n'ont pas pu être déplacés vers la corbeille :`,

  'confirm.title': (n: number) => `Déplacer ${n.toLocaleString()} fichier${n <= 1 ? '' : 's'} vers la corbeille`,
  'confirm.description': (size: string) =>
    `Vous récupérerez ${size}. Une copie de chaque fichier reste exactement là où elle est. Le reste part à la corbeille, vous pouvez donc tout récupérer à tout moment.`,
  'confirm.filesMoved': 'Fichiers déplacés',
  'confirm.filesKept': 'Fichiers conservés',
  'confirm.spaceReclaimed': 'Espace récupéré',
  'confirm.notYet': 'Pas maintenant',
  'confirm.moving': 'Déplacement…',
  'confirm.moveToTrashButton': 'Déplacer vers la corbeille',

  'images.changeFolder': 'Changer de dossier…',
  'images.rootWithHistory': (rootPath: string) => `${rootPath} + dossiers précédemment analysés`,
  'images.setsCount': (n: number) => `${n.toLocaleString()} ensemble${n <= 1 ? '' : 's'} de photos similaires`,
  'images.groupedDescription':
    'Regroupées par similarité visuelle, pas seulement par octets identiques — copies redimensionnées, recompressées ou légèrement modifiées comptent aussi.',
  'images.photosToTrash': (n: number) => `${n.toLocaleString()} photo${n <= 1 ? '' : 's'} à la corbeille`,
  'images.strict': 'STRICT',
  'images.loose': 'SOUPLE',
  'images.includeOtherFolders': 'Inclure aussi les photos des dossiers déjà analysés',
  'images.resultTrashed': (n: number, size: string) =>
    `${n.toLocaleString()} photo${n <= 1 ? '' : 's'} envoyée${n <= 1 ? '' : 's'} à la corbeille · ${size} récupérés`,
  'images.dismiss': 'Ignorer',
  'images.resultFailed': (n: number) =>
    `${n.toLocaleString()} photo${n <= 1 ? '' : 's'} ${n <= 1 ? "n'a pas pu être déplacée" : "n'ont pas pu être déplacées"} vers la corbeille`,
  'images.indexing': (indexed: number, total: number) =>
    `Indexation des photos… ${indexed.toLocaleString()} / ${total.toLocaleString()}`,
  'images.indexingNote': 'Nécessaire une seule fois par photo — les prochaines visites sont instantanées.',
  'images.comparing': 'Comparaison des photos…',
  'images.noPhotosFound': 'Aucune photo trouvée',
  'images.noPhotosDescriptionInclude':
    "Ce dossier (et tous les dossiers analysés précédemment) ne contient aucune photo que Duplix peut décoder.",
  'images.noPhotosDescription':
    'Ce dossier ne contient aucune photo que Duplix peut décoder. Cochez « inclure aussi les photos des dossiers déjà analysés » pour élargir la recherche, ou choisissez un autre dossier.',
  'images.noSimilarFound': 'Aucune photo similaire trouvée à cette sensibilité. Essayez de la réduire.',

  'imageGroupCard.similarityIdentical': 'Identique',
  'imageGroupCard.similarityNearlyIdentical': 'Presque identique',
  'imageGroupCard.similarityVerySimilar': 'Très similaire',
  'imageGroupCard.similaritySimilar': 'Similaire',
  'imageGroupCard.similarityLooselySimilar': 'Vaguement similaire',
  'imageGroupCard.similarPhotos': (n: number) => `${n} photo${n <= 1 ? '' : 's'} similaire${n <= 1 ? '' : 's'}`,
  'imageGroupCard.toKeep': (n: number) => ` · ${n} à conserver`,
  'imageGroupCard.trashingAll': 'TOUT À LA CORBEILLE',
  'imageGroupCard.trashing': 'Suppression…',
  'imageGroupCard.compare': 'Comparer',

  'compareModal.allWillBeTrashed': (n: number) =>
    `${n} photo${n <= 1 ? '' : 's'} similaire${n <= 1 ? '' : 's'} · ${n <= 1 ? 'elle sera supprimée' : 'toutes seront supprimées'}`,
  'compareModal.someToKeep': (n: number, keepCount: number) =>
    `${n} photo${n <= 1 ? '' : 's'} similaire${n <= 1 ? '' : 's'} · ${keepCount} à conserver`,
  'compareModal.backToGrid': '← Retour à la grille',
  'compareModal.keepNone': 'Ne rien conserver',
  'compareModal.keepAll': 'Tout conserver',
  'compareModal.trashSetNow': 'Supprimer cet ensemble maintenant',
  'compareModal.close': 'Fermer (Échap)',
  'compareModal.viewFullSize': (name: string) => `Voir ${name} en taille réelle`,
  'compareModal.keepChecked': 'CONSERVER ✓',
  'compareModal.previousPhoto': 'Photo précédente',
  'compareModal.nextPhoto': 'Photo suivante',

  'settings.title': 'Réglages',
  'settings.clearCacheTitle': "Vider le cache d'analyse",
  'settings.clearCacheDescription':
    "Duplix mémorise les empreintes des fichiers pour que ré-analyser un dossier inchangé soit rapide. Vider le cache efface cet historique — rien sur le disque n'est modifié, et la prochaine analyse de n'importe quel dossier recalculera tout depuis le début.",
  'settings.cacheCleared': (count: number) => `Cache vidé — ${count.toLocaleString()} entrées supprimées.`,
  'settings.clearing': 'Effacement…',
  'settings.clearCache': 'Vider le cache',
  'settings.done': 'Terminé',
  'settings.languageTitle': 'Langue',
  'settings.languageDescription': "Choisissez la langue d'affichage de Duplix.",
}

const dicts: Record<Language, Dict> = { en, fr }

interface LanguageContextValue {
  language: Language
  setLanguage: (language: Language) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: keyof typeof en, ...args: any[]) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(loadLanguage)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, language)
    } catch {
      // ignore
    }
  }, [language])

  const value = useMemo<LanguageContextValue>(() => {
    const dict = dicts[language]
    function t(key: keyof typeof en, ...args: unknown[]): string {
      const entry = dict[key]
      if (typeof entry === 'function') return entry(...args)
      return entry
    }
    return { language, setLanguage, t }
  }, [language])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useTranslation() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useTranslation must be used within a LanguageProvider')
  return ctx
}
