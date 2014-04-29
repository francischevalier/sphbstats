SPHB Stats
=========

Script qui cumule des statistiques d’une ligue sportive virtuelle basée sur le jeu HaxBall. Il s’agit d’un jeu très simple graphiquement qui correspond à un mélange entre le soccer et le air hockey. Après avoir analysé les rapports de match, le script remplit les tableaux de statistiques sur les équipes ainsi que sur les joueurs.

Grâce aux fonctions mises à disposition par Google, ce script est en mesure d’établir une connexion sur le forum SPHB. Par la suite, il consulte d’abord une page qui est en fait l’horaire de tous les matchs avec les résultats des matchs joués, qui lui permet aussi de récupérer tous les hyperliens des rapports de match. Le script accède ensuite à chacune de ses pages, enregistre toutes les informations dans des tableaux puis lorsque toutes les pages ont été analysées, écrit le tout dans des tableurs. Le script ayant maintenant toutes les informations nécessaires pour construire les statistiques, c’est à l’aide de formules disponibles dans les tableurs qu’il fait le reste du travail.

Auteur : Francis Chevalier
Création : 9 février 2014
Dernière modification : 2 mars 2014
Développement : Google Spreadsheets / Google Apps Script
