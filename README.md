![logo](/backend/icon.svg)

# Gnotus

Gnotus is an open-source, permissively licensed, and self-hosted knowledge-base software
for both public and internal documentation.

## Table of Contents

- [Features](#features)
- [Deployment](#deployment)
- [Development](#development)
- [License](#license)

## Features

- Light-weight single-page application built with React and FastAPI.
- Document caching for fast page loads
- In-app document creation and editing
- Markdown document format
- Automatically saves document revisions
- Public and private documents
- Full-text search, including in private documents
- In-app user management with various user roles

## Deployment

The recommended way to install Gnotus is with Docker Compose.

1. **Download the Docker Compose file**

   ```bash
   curl -L https://raw.githubusercontent.com/merlinz01/gnotus/main/compose.yml -o compose.yml
   ```

   If you are serving Gnotus on a public domain, you may want edit the `compose.yml` file to open ports 80 and 443 on the frontend service instead of 5173.

1. **Create the configuration file**

   Create a configuration file at `config.yml` in the same directory as `compose.yml`. This file will define the site branding.
   Use this as a template:

   ```yaml
   # config.yml
   site_name: "My Documentation Site"
   site_description: >
     This is my documentation site where I can
     create and manage documentation.
   primary_color: "#654321"
   secondary_color: "#123456"
   ```

1. **Configure the environment variables**

   Create a `.env` file in the same directory as `compose.yml` with the following content:

   ```ini
   # .env

   # The domain name of your Gnotus instance.
   # If you are serving Gnotus on a public domain, set this to your domain name
   # and make sure to open ports 80 and 443 in the frontend service.
   CADDY_DOMAIN=my.domain.com
   # The email address to use for Let's Encrypt registration.
   # This is required for the Caddy service to obtain SSL certificates.
   CADDY_EMAIL=me@example.com
   # GNOTUS_BASE_URL is the base URL of your Gnotus instance.
   # If you are serving Gnotus on a public domain, set this to your domain name.
   GNOTUS_BASE_URL=https://my.domain.com
   # The secret key for the backend service.
   # This must be changed a long, securely generated random string.
   GNOTUS_SECRET_KEY=your-secret-key
   ```

1. **Start the services**

   ```bash
   docker compose up -d
   ```

   This will download the necessary Docker images, and start everything for you.

1. **Create the initial admin user**

   After the services are up and running, you can create the initial admin user by running the following command:

   ```bash
   docker compose exec backend ./manage.sh create-user
   ```

   Follow the prompts to set up your admin user.

1. **Access the application**

   You can now access the Gnotus application at `http://localhost:5173` (or your configured domain if you set it up for public access).

   You can log in with the admin user you just created.

## Development

### (Recommended) With Docker Compose

If you want to develop Gnotus, the recommended way is to use Docker Compose to set up the development environment for both the backend and frontend.
Simply run the following command in the root directory of the project:

```bash
docker compose -f compose-dev.yml up --build
# Add the `-d` flag to run in the background
```

This will start the backend and frontend services in development mode, with hot-reloading enabled for both.
If you want to override settings, you can set them as environment variables in a `.env` file in the `backend` directory.

If you need to run commands in the backend service, you can use the following command:

```bash
docker compose -f compose.dev.yml exec backend <command>
```

### Without Docker Compose

You can also set up the development environment without Docker Compose, but this requires more manual setup.

#### Backend Setup

1. **Install Python dependencies**

   This project uses the [`uv`](https://docs.astral.sh/uv) package manager.

   ```bash
   cd backend
   uv sync
   ```

1. **Configure environment**

   - You can use the provided `config-dev.yml` or create your own `config-custom.yml` to customize the site title and appearance.

1. **Activate the virtual environment**

   ```bash
   source .venv/bin/activate
   ```

1. **(Optional) Start Meilisearch**

   If you want to test the full-text search functionality, you can run Meilisearch in a Docker container. This is optional, as Gnotus can run without it with the `disable_search` option set to `true` in the configuration file or the `GNOTUS_DISABLE_SEARCH` environment variable set to `true`.
   Note that disabling search will prevent you from using the search functionality in the app
   and will cause the search index to become out of sync with the documents if previously indexed.

   ```bash
   docker run -d --name meilisearch -p 7700:7700 getmeili/meilisearch:v1.15
   ```

   Make sure to set the `GNOTUS_MEILISEARCH_URL` and `GNOTUS_MEILISEARCH_API_KEY` environment variables (or the corresponding options in your configuration file) to connect to Meilisearch.

   To index all documents in Meilisearch, you can use the following command:

   ```bash
   GNOTUS_CONFIG_FILE=config-dev.yml python -m app.manage index
   ```

   To stop and remove the Meilisearch container, you can run:

   ```bash
   docker stop meilisearch
   docker rm meilisearch
   ```

1. **Run the backend server**
   ```bash
   GNOTUS_CONFIG_FILE=config-dev.yml fastapi dev
   ```
   The API will be available at `http://localhost:8000` and will auto-reload when you modify backend code.

#### Frontend Setup

1. **Install Node.js dependencies**

   ```bash
   cd frontend
   npm install
   ```

2. **Run the frontend development server**
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:5173` and will hot-reload when you modify frontend code.

## License

Gnotus is licensed under the MIT License.
See [LICENSE.txt](LICENSE.txt) for details.
