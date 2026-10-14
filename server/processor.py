import json
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader

def process_pdf(file_path):
    loader = PyPDFLoader(file_path)
    documents = loader.load()
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = text_splitter.split_documents(documents)
    return chunks

def extract_outline(file_path):
    reader = PdfReader(file_path)
    total_pages = len(reader.pages)

    def resolve_page(dest):
        try:
            return reader.get_destination_page_number(dest)
        except Exception:
            return None

    def walk(items):
        result = []
        for item in items:
            if isinstance(item, list):
                if result:
                    result[-1]["children"] = walk(item)
                continue
            result.append({"title": str(item.title), "page": resolve_page(item), "children": []})
        return result

    try:
        raw_outline = reader.outline
    except Exception:
        raw_outline = []

    if not raw_outline:
        return []

    tree = walk(raw_outline)

    def assign_ranges(nodes, end_page):
        for idx, node in enumerate(nodes):
            next_page = nodes[idx + 1]["page"] if idx + 1 < len(nodes) else None
            if next_page is not None:
                node["page_end"] = max(next_page - 1, node["page"] if node["page"] is not None else 0)
            else:
                node["page_end"] = end_page
            if node["children"]:
                assign_ranges(node["children"], node["page_end"])

    assign_ranges(tree, total_pages - 1)
    return tree

def extract_llm_outline(file_path, brain):
    import torch
    import gc
    reader = PdfReader(file_path)
    total_pages = len(reader.pages)
    
    toc_text = ""
    for i in range(min(3, total_pages)):
        page_text = reader.pages[i].extract_text()
        if page_text:
            toc_text += page_text + "\n"
            
    try:
        llm_toc = brain.extract_toc_from_text(toc_text)
        
        if not llm_toc:
            return []
            
        tree = []
        for item in llm_toc:
            try:
                page_val = int(item.get("page", 1)) - 1
            except Exception:
                page_val = 0
            tree.append({
                "title": str(item.get("title", "Topic")),
                "page": max(0, page_val),
                "children": []
            })
            
        def assign_ranges(nodes, end_page):
            for idx, node in enumerate(nodes):
                next_page = nodes[idx + 1]["page"] if idx + 1 < len(nodes) else None
                if next_page is not None:
                    node["page_end"] = max(next_page - 1, node["page"] if node["page"] is not None else 0)
                else:
                    node["page_end"] = end_page
                if node["children"]:
                    assign_ranges(node["children"], node["page_end"])

        assign_ranges(tree, total_pages - 1)
        return tree

    except torch.cuda.OutOfMemoryError:
        torch.cuda.empty_cache()
        gc.collect()
        print("VRAM yetersizliği nedeniyle LLM ile içindekiler çıkarma iptal edildi.")
        return []
    except Exception as e:
        print(f"LLM TOC Hatası: {e}")
        return []

def build_fallback_outline(file_path, pages_per_topic=15):
    reader = PdfReader(file_path)
    total_pages = len(reader.pages)
    topics = []
    start = 0
    while start < total_pages:
        end = min(start + pages_per_topic - 1, total_pages - 1)
        topics.append({
            "title": f"Sayfa {start + 1}-{end + 1}",
            "page": start,
            "page_end": end,
            "children": []
        })
        start = end + 1
    return [{
        "title": "İçerik",
        "page": 0,
        "page_end": total_pages - 1,
        "children": topics
    }]