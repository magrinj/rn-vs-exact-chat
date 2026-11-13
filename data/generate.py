"""Deterministic French WhatsApp-style chat generator. Usage: python3 generate.py [--photos]"""
import json, random, sys, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

SEED, N = 42, 10_000
ROOT = Path(__file__).parent
# ponytail: fixed Picsum ids so photos are reproducible; swap ids here if one ever 404s
PICSUM_IDS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 25, 26,
              27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41]
SIZES = [(1080, 1080), (1080, 1350), (1080, 720)]
PHOTOS = [f"photo_{i + 1:02d}.jpg" for i in range(len(PICSUM_IDS))]

SHORT = ["Ok ça marche 👍", "Ah grave !", "Trop bien 😂", "J'arrive bientôt", "Oui oui", "Bonne nuit 😘", "Mdr trop drôle", "Ah zut 😕",
         "Ah carrément !", "T'es où ?", "Merci beaucoup ❤️", "Pas de souci", "À plus !", "Bien vu 👌", "Ça marche",
         "Je regarde", "Oh non 😱", "Trop mignon 🥰", "Gros bisous !", "Vas-y fonce 💪", "Haha t'es bête 😅", "C'est noté",
         "Bonne journée ☀️", "J'ai hâte !", "Coucou toi 👋", "Pareil pour moi", "Exactement ça", "J'adore trop 😍", "Désolé vraiment 🙏", "Top merci !"]
OPENERS = ["Hello", "Coucou", "Dis", "Au fait", "Bon", "Alors", "Écoute", "Petite question", "Sinon", "Tiens"]
SENTENCES = [
    "je sors du boulot, je suis lessivé", "tu veux qu'on se fasse un resto ce soir ?",
    "j'ai enfin fini ce fichu dossier", "il pleut des cordes ici", "on se retrouve devant la gare à 19h ?",
    "j'ai croisé Julie au marché, elle te passe le bonjour", "le train a encore 20 minutes de retard",
    "tu as vu le match hier soir ?", "je viens de rentrer des courses", "j'ai réservé pour samedi midi",
    "ma mère a appelé, elle veut qu'on vienne dimanche", "j'ai trop mangé, je vais exploser",
    "je pense qu'on devrait partir plus tôt", "le chat a encore renversé sa gamelle",
    "j'ai commencé la série dont tu m'as parlé", "je suis en réunion jusqu'à 16h",
    "tu peux prendre du pain en rentrant ?", "il fait super beau aujourd'hui", "j'ai oublié mes clés au bureau",
    "on a reçu le colis", "je t'envoie l'adresse tout de suite", "j'ai mal dormi cette nuit",
    "le dentiste a décalé mon rendez-vous", "on pourrait aller à la mer ce week-end",
    "j'ai trouvé un appart sympa sur le Bon Coin", "la réunion s'est super bien passée",
    "j'ai raté mon bus, j'arrive dans 15 min", "tu as pensé à appeler le plombier ?",
    "je me suis inscrit au cours de yoga", "Paul organise un apéro vendredi",
    "j'ai testé la recette de ta grand-mère", "il faut qu'on parle des vacances",
    "le wifi ne marche plus à la maison", "je suis passé à la pharmacie",
    "on regarde un film ce soir ?", "j'ai eu des nouvelles pour le boulot",
]
ENDINGS = ["", "", "", " 😂", " 😅", " ❤️", " 🙄", " 😴", " 🎉", " 🤔", " !", " haha", " 😍", " 🙈", " 🍷"]
LINES = ["Bon je te raconte ma journée 😅", "D'abord le réveil n'a pas sonné.",
         "Ensuite j'ai renversé mon café sur ma chemise ☕", "Au boulot, réunion surprise à 9h pile.",
         "Le midi, impossible de trouver une table libre.", "L'après-midi est passé à toute vitesse.",
         "Et là je suis enfin dans le métro 🚇", "Bref, vivement les vacances 🏖️",
         "Liste de courses :", "- des œufs 🥚", "- du lait", "- des tomates 🍅", "- du fromage 🧀",
         "- du pain 🥖", "N'oublie pas le dîner chez tes parents samedi.",
         "Et il faut confirmer pour le mariage de Léa 💍", "Tu me diras ce que tu en penses ?"]
CAPTIONS = ["Regarde ça 😍", "La vue d'ici !", "Souvenir 📸", "Trop beau non ?", "Devine où je suis 😏",
            "Pour toi ❤️", "Ce matin", "Sans filtre 😎"]


def text_msg(r):
    roll = r.random()
    if roll < 0.40:
        return r.choice(SHORT)
    if roll < 0.75:
        s = r.choice(SENTENCES)
        if r.random() < 0.4:
            s = f"{r.choice(OPENERS)}, {s}"
        return s[0].upper() + s[1:] + r.choice(ENDINGS)
    if roll < 0.92:
        parts = r.sample(SENTENCES, r.randint(2, 3))
        return " ".join(p[0].upper() + p[1:] + ("" if p.endswith("?") else ".") for p in parts) + r.choice(ENDINGS[:-5])
    start = r.randrange(len(LINES) - 6)
    return "\n".join(LINES[start:start + r.randint(2, 6)])  # 2 to 6 lines


def generate():
    r = random.Random(SEED)
    t = datetime(2025, 1, 6, 8, 0, tzinfo=timezone.utc)
    author, out = "me", []
    for i in range(N):
        if r.random() < 0.35:  # alternate speakers with streaks
            author = "them" if author == "me" else "me"
        gap = r.choices([r.randint(5, 90), r.randint(60, 1800), r.randint(3600, 14 * 3600)], [70, 25, 5])[0]
        t += timedelta(seconds=gap)
        if t.hour < 7:  # nobody chats between midnight and 7am
            t = t.replace(hour=7, minute=r.randint(0, 59))
        kind = r.choices(["text", "photo", "voice"], [80, 12, 8])[0]
        m = {"id": i + 1, "author": author, "timestamp": t.strftime("%Y-%m-%dT%H:%M:%SZ"), "type": kind}
        if kind == "text":
            m["text"] = text_msg(r)
        elif kind == "photo":
            m["photo"] = r.choice(PHOTOS)
            if r.random() < 0.3:
                m["text"] = r.choice(CAPTIONS)
        else:
            m["duration"] = max(1, min(300, int(r.lognormvariate(2.8, 0.8))))
        out.append(m)
    return out


def download_photos():
    (ROOT / "photos").mkdir(exist_ok=True)
    for pid, name in zip(PICSUM_IDS, PHOTOS):
        dest = ROOT / "photos" / name
        if dest.exists():
            continue
        w, h = SIZES[pid % len(SIZES)]
        with urllib.request.urlopen(f"https://picsum.photos/id/{pid}/{w}/{h}.jpg", timeout=60) as res:
            dest.write_bytes(res.read())


if __name__ == "__main__":
    msgs = generate()
    (ROOT / "messages.json").write_text(json.dumps(msgs, ensure_ascii=False, indent=1))
    if "--photos" in sys.argv:
        download_photos()
    # self-check
    assert len(msgs) == N and generate() == msgs, "not deterministic"
    assert all(m["type"] != "photo" or (ROOT / "photos" / m["photo"]).exists() for m in msgs) or "--photos" not in sys.argv
    assert all(sum(any(c.isalpha() for c in w) for w in m["text"].split()) >= 2 for m in msgs if m["type"] == "text")
    print({k: sum(m["type"] == k for m in msgs) for k in ("text", "photo", "voice")}, msgs[-1]["timestamp"])
