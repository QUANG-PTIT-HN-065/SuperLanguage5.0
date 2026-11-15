-- SUPERLANGUAGE 5.0 - Dọn dẹp kho vector RAG cũ
--
-- Kho vector chính thức được định nghĩa trong 04_rag.sql:
--   public.rag_chunks
--   public.replace_rag_document(...)
--   public.match_rag_chunks(...)
--
-- Migration này chỉ xóa các đối tượng cũ nếu chúng đã được tạo bởi phiên bản
-- trước. Không tạo thêm bảng, RPC hoặc vector dimension khác.

drop function if exists public.match_knowledge(vector, double precision, integer, text);
drop table if exists public.knowledge_embeddings;
