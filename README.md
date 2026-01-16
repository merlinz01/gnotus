# Gnotus

![logo](/backend/icon.svg)

Gnotus is an open-source, permissively licensed, and self-hosted knowledge-base software
for both public and internal documentation.

![License](https://img.shields.io/github/license/merlinz01/gnotus)
![Contributors](https://img.shields.io/github/contributors/merlinz01/gnotus)
![Repo Size](https://img.shields.io/github/repo-size/merlinz01/gnotus)
![Top Language](https://img.shields.io/github/languages/top/merlinz01/gnotus)

![CI Build](https://img.shields.io/github/actions/workflow/status/merlinz01/gnotus/build.yml?branch=main)
![GitHub Issues](https://img.shields.io/github/issues/merlinz01/gnotus)
![GitHub Closed Pull Requests](https://img.shields.io/github/issues-pr-closed/merlinz01/gnotus)
![Last Commit](https://img.shields.io/github/last-commit/merlinz01/gnotus)

![Docker Pulls](https://img.shields.io/docker/pulls/merlinz01/gnotus-frontend)
![GitHub Stars](https://img.shields.io/github/stars/merlinz01/gnotus?style=flat)
![GitHub Forks](https://img.shields.io/github/forks/merlinz01/gnotus?style=flat)

## Table of Contents

- [Features](#features)
- [Deployment](#deployment)
- [Development](#development)
- [License](#license)

## Features

- Light-weight single-page application built with React and FastAPI.
- Browser caching for fast page loads
- In-app document creation and editing
- Markdown document format
- Upload management for images and other files
- Optimized for search engine indexing
- Supports both light and dark mode
- Responsive design for mobile, desktop, and print
- Customizable site branding with colors and logo
- Automatic table of contents generation
- Document history with the ability to revert to previous versions
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

1. **Configure the application**

   If you want to use a custom logo, you can simply place an SVG file named `icon.svg` in the same directory as `compose.yml`, and uncomment the line in the `compose.yml` file that mounts the icon file to the backend service:

   ```yaml
   backend:
     volumes:
       - ./icon.svg:/app/icon.svg
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

1. (Optional) **Configure IPv6**

   If your server is reachable via IPv6, it is recommended to configure IPv6 in Docker
   so that logging and rate limiting work correctly.
   (If you don't do this, the Caddy service will see all IPv6 requests as coming
   from the internal Docker gateway, which will mean that all IPv6 requests
   will be rate-limited as if they were all from the same IP address.)

   To do this, add the following line to your Docker daemon configuration file (usually located at `/etc/docker/daemon.json`):

   ```json
   {
     "ip6tables": true
   }
   ```

   Then restart the Docker service (you may want to stop the Docker Compose services first):

   ```bash
   sudo systemctl restart docker
   ```

   Create a new file `compose.override.yml` in the same directory as `compose.yml` with the following content:

   ```yaml
   networks:
     default:
       enable_ipv6: true
       ipam:
         config:
           - subnet: <your_ipv6_subnet>
             # e.g. "2001:db8:1::/64"
   ```

   Replace `<your_ipv6_subnet>` with your actual IPv6 subnet.

   Finally, restart the Docker Compose services:

   ```bash
   docker compose down
   docker compose up -d
   ```

   Now the Caddy service should be able to correctly log and rate limit IPv6 requests.

## Development

### (Recommended) With Docker Compose

If you want to develop Gnotus, the recommended way is to use Docker Compose to set up the development environment for both the backend and frontend.
Simply run the following command in the root directory of the project:

```bash
docker compose -f compose.dev.yml up --build
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

   You can use the provided `config-dev.yml` or create your own `config-custom.yml` to customize the site title and appearance.

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
