create extension if not exists vector with schema extensions;

create table if not exists public.rag_chunks (
  id uuid primary key default gen_random_uuid(),
  document_key text not null,
  chunk_index integer not null check (chunk_index >= 0),
  title text not null,
  language_code text not null check (language_code in ('English', 'Japanese', 'all')),
  content text not null,
  embedding extensions.vector(768) not null,
  created_at timestamptz not null default now(),
  unique (document_key, chunk_index)
);

create index if not exists rag_chunks_embedding_hnsw_idx
  on public.rag_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.rag_chunks enable row level security;
revoke all on public.rag_chunks from anon, authenticated;
grant all on public.rag_chunks to service_role;

create or replace function public.replace_rag_document(
  p_document_key text,
  p_title text,
  p_language_code text,
  p_chunks jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  chunk jsonb;
  inserted_count integer := 0;
begin
  if p_language_code not in ('English', 'Japanese', 'all') then
    raise exception 'Unsupported RAG document language.';
  end if;

  if jsonb_typeof(p_chunks) <> 'array' or jsonb_array_length(p_chunks) = 0 then
    raise exception 'RAG document must contain at least one chunk.';
  end if;

  delete from public.rag_chunks where document_key = p_document_key;

  for chunk in select value from jsonb_array_elements(p_chunks)
  loop
    insert into public.rag_chunks (
      document_key,
      chunk_index,
      title,
      language_code,
      content,
      embedding
    )
    values (
      p_document_key,
      (chunk ->> 'chunk_index')::integer,
      p_title,
      p_language_code,
      chunk ->> 'content',
      (chunk ->> 'embedding')::extensions.vector(768)
    );
    inserted_count := inserted_count + 1;
  end loop;

  return inserted_count;
end;
$$;

create or replace function public.match_rag_chunks(
  p_embedding extensions.vector(768),
  p_language_code text,
  p_match_count integer default 4,
  p_similarity_threshold double precision default 0.45
)
returns table (
  title text,
  content text,
  similarity double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    chunks.title,
    chunks.content,
    (1 - (chunks.embedding OPERATOR(extensions.<=>) p_embedding))::double precision as similarity
  from public.rag_chunks as chunks
  where chunks.language_code in (p_language_code, 'all')
    and 1 - (chunks.embedding OPERATOR(extensions.<=>) p_embedding) >= p_similarity_threshold
  order by chunks.embedding OPERATOR(extensions.<=>) p_embedding
  limit greatest(1, least(p_match_count, 10));
$$;

revoke all on function public.replace_rag_document(text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.match_rag_chunks(extensions.vector, text, integer, double precision)
  from public, anon, authenticated;
grant execute on function public.replace_rag_document(text, text, text, jsonb)
  to service_role;
grant execute on function public.match_rag_chunks(extensions.vector, text, integer, double precision)
  to service_role;
