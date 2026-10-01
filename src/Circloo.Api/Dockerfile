# syntax=docker/dockerfile:1
# One production image: the API serves the built React SPA from wwwroot. Build context = repo root.

FROM node:24-alpine AS web
WORKDIR /web
COPY src/web/package.json src/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY src/web/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api
WORKDIR /src
COPY global.json Directory.Build.props Directory.Packages.props ./
COPY src/Circloo.ServiceDefaults/Circloo.ServiceDefaults.csproj src/Circloo.ServiceDefaults/
COPY src/Circloo.Api/Circloo.Api.csproj src/Circloo.Api/
RUN dotnet restore src/Circloo.Api/Circloo.Api.csproj
COPY src/Circloo.ServiceDefaults/ src/Circloo.ServiceDefaults/
COPY src/Circloo.Api/ src/Circloo.Api/
COPY content/fun/ content/fun/
COPY --from=web /web/dist/ src/Circloo.Api/wwwroot/
RUN dotnet publish src/Circloo.Api/Circloo.Api.csproj -c Release -o /app --no-restore /p:UseAppHost=false

# Chiseled: no shell, no package manager, runs as non-root (uid 1654).
FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled AS final
WORKDIR /app
COPY --from=api /app ./
# Forwarded-header trust is turned on by the deployment (Bicep), never baked into the image.
ENV ASPNETCORE_HTTP_PORTS=3000 \
    DOTNET_RUNNING_IN_CONTAINER=true
EXPOSE 3000
USER $APP_UID
ENTRYPOINT ["dotnet", "Circloo.Api.dll"]
