import { createHandler } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_ANON_KEY')!;
// Public, canonical URL used for OAuth resource discovery, never a secret.
const publicUrl = Deno.env.get('OS_MCP_PUBLIC_URL') ?? `${url}/functions/v1/os-mcp`;
Deno.serve(createHandler({ url, key, publicUrl }));
