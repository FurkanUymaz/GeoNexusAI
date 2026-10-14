import os
import json
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

INDEX_DIR = "index_store"
INDEX_PATH = os.path.join(INDEX_DIR, "faiss.index")
META_PATH = os.path.join(INDEX_DIR, "metadata.json")
EMBED_DIM = 384

class GeoNexusBrain:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.embedder = SentenceTransformer("all-MiniLM-L6-v2", device=self.device)
        self.model_name = "Qwen/Qwen2.5-3B-Instruct"
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
        self.model = AutoModelForCausalLM.from_pretrained(
            self.model_name,
            torch_dtype=torch.float16 if self.device == "cuda" else torch.float32
        )
        self.model.to(self.device)
        self.metadata = []
        os.makedirs(INDEX_DIR, exist_ok=True)
        if os.path.exists(INDEX_PATH) and os.path.exists(META_PATH):
            self.index = faiss.read_index(INDEX_PATH)
            with open(META_PATH, "r", encoding="utf-8") as f:
                self.metadata = json.load(f)
        else:
            self.index = faiss.IndexFlatIP(EMBED_DIM)

    def _save(self):
        faiss.write_index(self.index, INDEX_PATH)
        with open(META_PATH, "w", encoding="utf-8") as f:
            json.dump(self.metadata, f, ensure_ascii=False)

    def add_pdf_chunks(self, chunks, source_name=""):
        texts = [c.page_content for c in chunks]
        if not texts:
            return
        vectors = self.embedder.encode(texts, normalize_embeddings=True)
        vectors = np.array(vectors, dtype="float32")
        self.index.add(vectors)
        for c in chunks:
            page = c.metadata.get("page", None)
            self.metadata.append({
                "text": c.page_content,
                "source": source_name,
                "page": page
            })
        self._save()

    def search_relevant_context(self, query, top_k=4):
        if self.index.ntotal == 0:
            return []
        query_vector = self.embedder.encode([query], normalize_embeddings=True)
        query_vector = np.array(query_vector, dtype="float32")
        scores, ids = self.index.search(query_vector, min(top_k, self.index.ntotal))
        results = []
        for score, idx in zip(scores[0], ids[0]):
            if idx == -1:
                continue
            item = self.metadata[idx]
            results.append({
                "text": item["text"],
                "source": item["source"],
                "page": item["page"],
                "score": float(score)
            })
        return results

    def get_context_by_page_range(self, source_name, page_start, page_end):
        results = []
        for item in self.metadata:
            if item["source"] != source_name:
                continue
            page = item["page"]
            if page is None:
                continue
            if page_start is not None and page < page_start:
                continue
            if page_end is not None and page > page_end:
                continue
            results.append(item)
        return results

    def extract_toc_from_text(self, text):
        system_prompt = "You are a data extraction parser. Extract the Table of Contents from the provided text. Output ONLY a valid JSON array of objects. Do not include markdown formatting, code blocks, or any other text. Each object must have exactly two keys: 'title' as a string and 'page' as an integer."
        prompt = f"<|im_start|>system\n{system_prompt}<|im_end|>\n<|im_start|>user\n{text}<|im_end|>\n<|im_start|>assistant\n"
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.device)
        input_length = inputs.input_ids.shape[1]
        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=2048,
                do_sample=False,
                temperature=0.01,
                repetition_penalty=1.0,
                pad_token_id=self.tokenizer.eos_token_id
            )
        generated_tokens = outputs[0][input_length:]
        response = self.tokenizer.decode(generated_tokens, skip_special_tokens=True).strip()
        response = response.replace("```json", "").replace("```", "").strip()
        try:
            return json.loads(response)
        except Exception:
            return []

    def generate_topic_title(self, context_items):
        if not context_items:
            return "Genel Konu"
        context_text = "\n---\n".join(item["text"] for item in context_items[:6])
        system_prompt = "Sana verilen metin parçasının ana konusunu tek bir kısa başlıkla özetle. Başlık en fazla 8 kelime olsun. Sadece başlığı yaz, açıklama yapma, tırnak işareti kullanma."
        prompt = f"<|im_start|>system\n{system_prompt}<|im_end|>\n<|im_start|>user\nMetin:\n{context_text}\n\nBu metnin konu başlığı nedir?<|im_end|>\n<|im_start|>assistant\n"
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.device)
        input_length = inputs.input_ids.shape[1]
        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=24,
                do_sample=False,
                temperature=0.01,
                repetition_penalty=1.0,
                pad_token_id=self.tokenizer.eos_token_id
            )
        generated_tokens = outputs[0][input_length:]
        title = self.tokenizer.decode(generated_tokens, skip_special_tokens=True).strip()
        title = title.strip('"').strip("'").split("\n")[0].strip()
        return title if title else "Genel Konu"

    def generate_lecture(self, topic_title, context_items):
        if not context_items:
            return "Bu konu için yüklenen belgede yeterli içerik bulunamadı."
        context_text = "\n---\n".join(item["text"] for item in context_items)
        system_prompt = "Sen bir üniversite hocasısın. Sana verilen metne dayanarak bir konuyu öğrenciye anlatır gibi, açık, sıralı ve öğretici bir dille anlat. Metinde olmayan bir bilgiyi asla uydurma. Matematiksel ifadeleri yazarken sadece $ ... $ (satır içi) veya $$ ... $$ (blok) formatını kullan, \\( \\) veya \\[ \\] kullanma."
        prompt = f"<|im_start|>system\n{system_prompt}<|im_end|>\n<|im_start|>user\nMetin:\n{context_text}\n\nKonu: {topic_title}\nBu konuyu bu metne dayanarak anlat.<|im_end|>\n<|im_start|>assistant\n"
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.device)
        input_length = inputs.input_ids.shape[1]
        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=1024,
                do_sample=False,
                temperature=0.01,
                repetition_penalty=1.0,
                pad_token_id=self.tokenizer.eos_token_id
            )
        generated_tokens = outputs[0][input_length:]
        lecture_text = self.tokenizer.decode(generated_tokens, skip_special_tokens=True).strip()
        return lecture_text

    def generate_answer(self, query, context_items):
        if not context_items:
            return "Üzgünüm, bu bilgi yüklenen belgelerde bulunmuyor."
        context_text = "\n---\n".join(item["text"] for item in context_items)
        system_prompt = "Sen bir bilgi çıkarma robotusun. Sana verilen metne dayanarak soruyu net ve doğru şekilde cevapla. Metinde olmayan bir bilgiyi asla uydurma. Matematiksel ifadeleri yazarken sadece $ ... $ (satır içi) veya $$ ... $$ (blok) formatını kullan, \\( \\) veya \\[ \\] kullanma."
        prompt = f"<|im_start|>system\n{system_prompt}<|im_end|>\n<|im_start|>user\nMetin:\n{context_text}\n\nSoru: {query}<|im_end|>\n<|im_start|>assistant\n"
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.device)
        input_length = inputs.input_ids.shape[1]
        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=1024,
                do_sample=False,
                temperature=0.01,
                repetition_penalty=1.0,
                pad_token_id=self.tokenizer.eos_token_id
            )
        generated_tokens = outputs[0][input_length:]
        answer = self.tokenizer.decode(generated_tokens, skip_special_tokens=True).strip()
        return answer