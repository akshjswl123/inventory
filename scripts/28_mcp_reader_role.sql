-- Read-only role for PostgreSQL MCP (chornthorn/postgresql-mcp-server).
-- Password must match MCP_READER_PASSWORD in .env / docker-compose (see .env.example).
-- Re-run safely on existing DBs: docker exec -i poc_db psql -U poc -d poc -f scripts/28_mcp_reader_role.sql

DO $do$
BEGIN
    CREATE ROLE mcp_reader WITH LOGIN PASSWORD 'McpReadOnly_ChangeMe2026';
EXCEPTION
    WHEN duplicate_object THEN
        ALTER ROLE mcp_reader WITH LOGIN PASSWORD 'McpReadOnly_ChangeMe2026';
END
$do$;

GRANT CONNECT ON DATABASE poc TO mcp_reader;
GRANT USAGE ON SCHEMA public TO mcp_reader;

-- PG 14+: read all tables, views, sequences in all schemas (incl. future objects for tables/views).
GRANT pg_read_all_data TO mcp_reader;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO mcp_reader;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO mcp_reader;

ALTER DEFAULT PRIVILEGES FOR ROLE poc IN SCHEMA public
    GRANT SELECT ON TABLES TO mcp_reader;

ALTER DEFAULT PRIVILEGES FOR ROLE poc IN SCHEMA public
    GRANT SELECT ON SEQUENCES TO mcp_reader;
