# Django CV App (sans Docker)

Application web de gestion de CV avec:
- Import PDF/DOC/DOCX/image
- Extraction texte + parsing des sections principales
- Editeur interactif pre-rempli (experience, formation, competences, infos perso)
- Sauvegarde locale SQLite

## 1) Installation (Windows PowerShell)

```powershell
cd "C:\Users\LBS PC\cv-ai-app\django-cv-app"
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## 2) Variables d'environnement (optionnel mais recommande)

Si vous voulez OCR image + parsing IA OpenAI:

```powershell
$env:OPENAI_API_KEY="votre_cle"
```

Sans cle, l'app fonctionne quand meme avec un parsing local simplifie (surtout PDF/DOCX, DOC en mode best-effort).

## 3) Initialiser la base et lancer

```powershell
python manage.py migrate
python manage.py runserver 127.0.0.1:8010
```

Ouvrir: http://127.0.0.1:8010

## API disponibles
- `POST /api/parse-cv`
- `POST /api/save-cv`
- `GET /api/cv-list`
- `GET /api/cv/<id>`
