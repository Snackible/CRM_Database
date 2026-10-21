/** @type {import('next').NextConfig} */
const nextConfig = {
  // Loaded by Node at run time instead of being bundled (PGlite ships a WASM database).
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "same-origin" },
      ],
    },
  ],
};

export default nextConfig;
