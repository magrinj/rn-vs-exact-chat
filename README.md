# React Native vs Exact : la même app de chat, mesurée sur iPhone

Une app de chat façon WhatsApp, construite deux fois par un agent IA à partir du même cahier des charges : une fois en **React Native (Expo)**, une fois avec **[Exact](https://github.com/expo/exact)**. Les deux versions ont ensuite reçu le même prompt d'optimisation, puis ont été mesurées sur le même iPhone 17 Pro, en build Release.

https://github.com/user-attachments/assets/b4eecb46-8879-4a6b-b8f7-b1cdb9038d22

ouverture en temps réel puis au ralenti ×6, puis scroll au doigt jusqu'au message 1. La fin du scroll de React Native est accélérée ×4, avec la mention à l'écran. Les deux écrans sont calés sur l'instant où le doigt quitte l'icône.

## L'app

- 10 000 messages (79 % de texte, 12 % de photos, 9 % de vocaux), 30 photos, et un message entrant chaque seconde.
- Une conversation française générée et déterministe : voir `data/` et `data/generate.py`.
- Les contraintes communes aux deux apps :
  - les bulles des derniers messages sont visibles dès la première image ;
  - les 10 000 messages restent accessibles en scrollant ;
  - une arrivée de message ne recopie ni ne retraite jamais tout l'historique ;
  - la position de lecture reste stable.

| | React Native | Exact |
|---|---|---|
| Dossier | `rn/` | `exact-app/` |
| Pile | Expo SDK 58, RN 0.88.1, Hermes, Legend List 3.7.2, react-native-keyboard-controller 1.22.7, Reanimated 4.7.1, expo-image | Exact (commit `57c86055` de expo/exact) |
| Liste | `KeyboardAwareLegendList`, une fenêtre de 200 à 600 lignes chargée par pages | `list virtualized=true`, une fenêtre de 200 à 400 lignes chargée par pages |
| Données | lignes préparées au build (`scripts/build-rows.mjs`) | lignes calculées dans `app.ts` |
| Particularité | deux correctifs (`rn/patches/`) sur react-native-worklets et Reanimated : au repos, l'écran tournait à 120 images/s sans rien à afficher | — |

## Ce que l'agent a coûté

Ces chiffres couvrent toute la session de l'agent dédié à chaque app, avec le modèle claude-opus-5-5.

| | React Native | Exact |
|---|---|---|
| Coût | 13,26 $ | 27,34 $ |
| Temps de calcul de l'API | 26 min 23 s | 41 min 53 s |
| Lignes ajoutées / supprimées | +710 / −65 | +296 / −97 |
| Requêtes | 182 | 258 |

## Résultats

Toutes les mesures sont faites sur un iPhone 17 Pro, avec des builds Release, sur le même appareil pour les deux apps.

| Mesure | React Native | Exact | Échantillon |
|---|---|---|---|
| Taille installée (.app) | 54 Mo | **37 Mo** | — |
| Démarrage à froid, messages visibles¹ | 250 ms | **150 ms** | 1 lancement par app |
| Démarrage à froid, écran complet¹ | 283 ms | **200 ms** | 1 lancement par app |
| Pendant l'animation d'ouverture d'iOS | écran blanc | messages déjà affichés | à chaud comme à froid |
| Démarrage à chaud, première image² | **215 ms** | 228 ms | 20 lancements par app, écart-type < 3 % |
| Démarrage à chaud, messages visibles³ (médiane) | 325 ms | **283 ms** | 10 lancements par app |
| Démarrage à chaud, écran complet³ (médiane) | **338 ms** | 392 ms | 10 lancements par app |
| Scroll au doigt jusqu'au message 1 (depuis le premier geste) | 44,7 s | **18,3 s** | 1 passage par app |
| Scroll robot jusqu'au message 1⁴ | atteint 1 fois sur 3 | **atteint 3 fois sur 3** (92-97 s) | 3 passes par app |
| Images avec un trou dans la liste, scroll robot⁵ | 0,4 à 0,9 % | **0 à 0,1 %** | 2 à 3 passes |
| Images avec un trou dans la liste, scroll au doigt⁵ | 2,0 % | **0,5 %** | 1 passage |
| CPU au repos (60 s, 1 message/s) | 2,8 à 3,0 % | 2,9 % | 2 et 1 passes |
| Mémoire au repos (empreinte physique) | 53 → 62 Mo, en hausse | **20 → 23 Mo** | 2 et 1 passes |

1. Depuis l'instant où le doigt quitte l'icône, mesuré sur la vidéo de l'écran : premier lancement de chaque app après un redémarrage du téléphone.
2. `XCTApplicationLaunchMetric`, la mesure de lancement d'Apple dans XCTest.
3. Depuis le début de l'animation d'ouverture d'iOS, mesuré sur la vidéo.
4. Rafales de gestes synthétisés par XCTest : environ 8 lancers par seconde à 8 000 pt/s, avec un maximum de 800 lancers, soit environ 97 s.
5. Images, prises pendant que la liste bouge, où la zone des messages ne contient presque aucune bulle.

### Ce que ces chiffres disent

- **Mémoire** : Exact consomme près de 3 fois moins, et sa mémoire ne grimpe pas au repos.
- **Ouverture** : Exact affiche les messages pendant l'animation d'ouverture d'iOS, alors que React Native montre un écran blanc puis les messages. À chaud, les deux apps finissent d'afficher leur écran au même moment, à ±50 ms près.
- **Scroll très rapide** : Exact remonte les 10 000 messages plus vite et avec moins de trous. React Native reste fluide, mais va moins loin à chaque lancer.
- **CPU au repos** : égalité. React Native y arrive grâce aux deux correctifs de `rn/patches/` ; sans eux, il était à 7 %.

### Limites

- **Pas de comptage des saccades (« hitches »)** : Instruments n'a pas tenu la liaison avec le téléphone pendant les scrolls de React Native, donc aucune comparaison n'est publiée.
- Le démarrage à froid et le scroll au doigt reposent sur **un seul essai par app**.
- La vidéo est captée en USB à 60 images/s au maximum, donc chaque temps lu sur la vidéo est précis à environ ±17 ms. Pendant les rafales du robot, ce flux descend à 16-30 images/s, pour les deux apps.
- Les deux apps tournent sur un iPhone qui a aussi d'autres apps installées. Les mesures sont faites avec « Ne pas déranger » activé et le téléphone branché.

## Méthode et outils (`bench/`)

- `screenrec.swift` : enregistre l'écran de l'iPhone branché en USB (la même source que QuickTime) et écrit, pour chaque image, son horodatage, la part de bulles visibles et le changement par rapport à l'image précédente.
- `analyze_launch2.py` : temps de lancement mesurés sur la vidéo. Le script détecte le début de l'animation d'ouverture, puis l'instant où les contours des messages (le texte, les bords des bulles) atteignent 50 % puis 90 % de ceux de l'écran final. Cette mesure compte aussi les messages encore en train d'apparaître pendant le fondu d'iOS.
- `ui/` : un projet XCUITest (à générer avec `xcodegen`) qui pilote les deux apps de façon identique, à partir de leur identifiant.
  - Les lancers sont envoyés en un seul événement synthétisé, pour qu'ils s'enchaînent sans pause.
  - L'attente de « repos » de XCTest est désactivée, parce qu'un chat qui reçoit un message par seconde n'est jamais au repos.
- `warm.sh` : lancements à chaud. `top.sh` : remontée par le robot. `idle.sh` + `idle.py` : repos sous Instruments.
- `make_video.py` : monte la vidéo côte à côte à partir de deux enregistrements au doigt.
- `results/` : les données brutes de chaque enregistrement, une ligne par image.

## Reproduire

```sh
git clone https://github.com/magrinj/rn-vs-exact-chat && cd rn-vs-exact-chat
git clone https://github.com/expo/exact exact && git -C exact checkout 57c86055   # le framework, attendu dans ../exact par exact-app

# React Native
cd rn && npm install && node scripts/build-rows.mjs && npx expo prebuild -p ios
xcodebuild -workspace ios/Chat.xcworkspace -scheme Chat -configuration Release -destination generic/platform=iOS -allowProvisioningUpdates
xcrun devicectl device install app --device $DEVICE ios/build/.../Release-iphoneos/Chat.app

# Exact
cd ../exact-app && bun exact.mjs ios --release --device --phone $DEVICE

# Mesures
cd ../bench && swiftc -O screenrec.swift -o screenrec
(cd ui && DEVELOPMENT_TEAM=<ton équipe> xcodegen generate && xcodebuild -project Bench.xcodeproj -scheme Bench -destination id=$DEVICE -allowProvisioningUpdates build-for-testing)
DEVICE=<udid> ./warm.sh
```

Avant de mesurer, sur l'iPhone : verrouillage automatique sur « Jamais », « Ne pas déranger » activé, et une seule séance d'Instruments ou de XCUITest à la fois.
