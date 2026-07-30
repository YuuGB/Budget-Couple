# Notre budget

App de budget commun (React + Vite), à héberger gratuitement sur GitHub Pages,
avec synchronisation en temps réel entre vos deux téléphones via Firebase.

## ✅ Synchronisation en temps réel

Cette version utilise **Firebase Realtime Database** (gratuit) : dès que l'un
de vous deux ajoute une dépense, modifie un budget, etc., l'autre le voit
apparaître automatiquement sur son téléphone, sans avoir à recharger la page.

### Sécuriser la base de données (à faire une fois)
Le projet Firebase est créé en mode "test", ce qui veut dire que ses règles
d'accès expirent après un certain temps. Pour éviter que l'app arrête de
fonctionner après quelques semaines :

1. Va sur [console.firebase.google.com](https://console.firebase.google.com)
2. Ouvre ton projet `budget-couple`
3. Dans le menu de gauche : **Build > Realtime Database**
4. Clique l'onglet **Rules** (Règles)
5. Remplace le contenu par celui du fichier `firebase-database-rules.json`
   fourni dans ce projet
6. Clique **Publier**

Ces règles autorisent la lecture/écriture uniquement sur le chemin
`budget-data` utilisé par l'app — pas besoin de compte ni mot de passe pour
vous deux, mais gardez le lien du site et les clés Firebase entre vous.

## Déployer sur GitHub Pages — étapes précises

### 1. Créer le dépôt GitHub
1. Va sur [github.com/new](https://github.com/new)
2. Nomme-le par exemple `budget-couple`
3. Laisse-le **public** (nécessaire pour GitHub Pages gratuit)
4. Ne coche aucune case (pas de README, pas de licence) — clique juste "Create repository"

### 2. Vérifier le nom dans la config
Ouvre `vite.config.js` dans ce projet et vérifie que la ligne `base:`
correspond **exactement** au nom de ton dépôt :
```js
base: "/budget-couple/",
```
Si tu as nommé ton dépôt différemment, remplace `budget-couple` par ce nom exact.

### 3. Envoyer le code sur GitHub
Depuis ce dossier de projet, dans un terminal :

```bash
git init
git add .
git commit -m "Première version du budget"
git branch -M main
git remote add origin https://github.com/TON-PSEUDO/budget-couple.git
git push -u origin main
```

Remplace `TON-PSEUDO` par ton nom d'utilisateur GitHub.

### 4. Activer GitHub Pages
1. Sur la page de ton dépôt GitHub, va dans **Settings**
2. Dans le menu de gauche, clique **Pages**
3. Sous "Build and deployment" → "Source", choisis **GitHub Actions**
4. Le déploiement se lance automatiquement (regarde l'onglet **Actions** du
   dépôt pour voir la progression, ça prend 1-2 minutes)

### 5. Ouvrir le site
Une fois le déploiement terminé (icône verte ✅ dans l'onglet Actions), le
site est disponible à :
```
https://TON-PSEUDO.github.io/budget-couple/
```

## Développement local

```bash
npm install
npm run dev
```

## Mettre à jour le site après une modification

```bash
git add .
git commit -m "Description de la modification"
git push
```

Le déploiement se relance automatiquement à chaque `push` sur `main`.
