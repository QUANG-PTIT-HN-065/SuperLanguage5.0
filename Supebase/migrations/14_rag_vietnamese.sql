begin;

alter table public.rag_chunks
  drop constraint rag_chunks_language_code_check,
  add constraint rag_chunks_language_code_check
    check (language_code in ('English', 'Japanese', 'Vietnamese', 'all'));

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
  if p_language_code not in ('English', 'Japanese', 'Vietnamese', 'all') then
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

notify pgrst, 'reload schema';

commit;
