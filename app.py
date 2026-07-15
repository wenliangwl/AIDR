"""
AIDR-Protected AI Chatbot
Flask backend with CrowdStrike AIDR guardrails and multi-provider LLM support.
"""

import os
import json
import uuid
import getpass
import traceback
from datetime import datetime, timezone
from flask import Flask, render_template, request, jsonify, session
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev-secret-key-change-me")

# ---------------------------------------------------------------------------
# AIDR identity fields (shown on the AIDR dashboard for each event)
# ---------------------------------------------------------------------------
AIDR_APP_ID = os.getenv("AIDR_APP_ID", "Demo-Chatbot")

def _default_aidr_user_id():
    """Fall back to the local OS username if AIDR_USER_ID isn't set."""
    try:
        return getpass.getuser()
    except Exception:
        return "aidr-demo-user"

AIDR_USER_ID = os.getenv("AIDR_USER_ID", "").strip() or _default_aidr_user_id()

# Human-readable provider names for the AIDR dashboard's llm_provider field
PROVIDER_DISPLAY_NAMES = {
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "gemini": "Google Gemini",
    "groq": "Groq",
    "ollama": "Ollama",
}

# ---------------------------------------------------------------------------
# AIDR Client Setup
# ---------------------------------------------------------------------------
aidr_client = None

def init_aidr():
    """Initialize the CrowdStrike AIDR client."""
    global aidr_client
    token = os.getenv("AIDR_TOKEN", "").strip()
    if not token:
        print("[AIDR] ⚠️  No AIDR token configured. Enter one via Settings in the UI.")
        aidr_client = None
        return
    try:
        from crowdstrike_aidr import AIGuard
        aidr_client = AIGuard(
            base_url_template=os.getenv("AIDR_BASE_URL", "https://api.us-2.crowdstrike.com/aidr/aiguard"),
            token=token,
        )
        print("[AIDR] ✅ AIGuard client initialized successfully.")
    except Exception as e:
        print(f"[AIDR] ⚠️  Failed to initialize AIGuard: {e}")
        print("[AIDR] The chatbot will operate WITHOUT AIDR protection.")
        aidr_client = None

init_aidr()

# ---------------------------------------------------------------------------
# Chat Session Store (persisted to chat_history.json)
# ---------------------------------------------------------------------------
HISTORY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chat_history.json")


def _load_chat_sessions():
    """Load chat sessions from disk."""
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r") as f:
                return json.load(f)
        except Exception as e:
            print(f"[HISTORY] ⚠️  Could not load chat_history.json: {e}")
    return {}


def _save_chat_sessions():
    """Persist chat sessions to disk."""
    try:
        with open(HISTORY_FILE, "w") as f:
            json.dump(chat_sessions, f, indent=2, default=str)
    except Exception as e:
        print(f"[HISTORY] ⚠️  Could not save chat_history.json: {e}")


chat_sessions = _load_chat_sessions()  # chat_id -> session dict

# ---------------------------------------------------------------------------
# Persona System Prompts
# ---------------------------------------------------------------------------
PERSONAS = {
    "customer_support": {
        "name": "Customer Support",
        "system_prompt": (
            "You are a friendly and professional customer support agent. "
            "Your role is to help customers with their questions, resolve issues, "
            "and provide clear, concise guidance. Always be polite, empathetic, "
            "and solution-oriented. If you don't know the answer, suggest the "
            "customer reach out to a specialist. Keep responses helpful and to the point."
        ),
    },
    "security_qa": {
        "name": "Security Q&A",
        "system_prompt": (
            "You are a cybersecurity expert assistant. Your role is to answer "
            "questions about information security, threat detection, incident response, "
            "vulnerability management, compliance frameworks, and security best practices. "
            "Provide accurate, detailed, and actionable advice. Reference industry standards "
            "like NIST, MITRE ATT&CK, and CIS Controls when relevant. Never provide "
            "instructions for malicious activities — instead, explain defensive measures."
        ),
    },
}

# ---------------------------------------------------------------------------
# Default model lists per provider
# ---------------------------------------------------------------------------
DEFAULT_MODELS = {
    "openai": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    "anthropic": ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
    "gemini": ["gemma-4-26b-a4b-it", "gemini-3.1-flash-lite-preview"],
    "groq": ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it", "groq/compound", "groq/compound-mini"],
    "ollama": [],  # Fetched dynamically from the Ollama instance
}

# ---------------------------------------------------------------------------
# AIDR Guard Helpers
# ---------------------------------------------------------------------------
def aidr_guard(messages, event_type, model=None, llm_provider=None):
    """
    Run CrowdStrike AIDR guard on messages.
    Returns (is_blocked: bool, details: dict).

    Response structure (from SDK):
      response.status         -> "Success"
      response.result.blocked -> True/False
      response.result.policy  -> policy name that triggered
      response.result.detectors -> detector details
      response.result.guard_output -> transformed/redacted content
    """
    if aidr_client is None:
        return False, {"status": "aidr_unavailable"}

    try:
        guard_kwargs = {
            "guard_input": {"messages": messages},
            "event_type": event_type,
            "app_id": AIDR_APP_ID,
            "user_id": AIDR_USER_ID,
        }
        if model:
            guard_kwargs["model"] = model
        if llm_provider:
            guard_kwargs["llm_provider"] = PROVIDER_DISPLAY_NAMES.get(llm_provider, llm_provider)

        response = aidr_client.guard_chat_completions(**guard_kwargs)

        # Access the result object
        result = getattr(response, "result", None)
        if result is None:
            return False, {"status": "allowed", "raw_status": getattr(response, "status", "unknown")}

        is_blocked = getattr(result, "blocked", False) or False
        policy = getattr(result, "policy", None)
        detectors = getattr(result, "detectors", None)
        transformed = getattr(result, "transformed", False)

        if is_blocked:
            return True, {
                "status": "blocked",
                "policy": policy or "Policy violation detected",
                "detectors": str(detectors) if detectors else None,
                "transformed": transformed,
            }

        return False, {
            "status": "allowed",
            "transformed": transformed,
            "policy": policy,
        }
    except Exception as e:
        print(f"[AIDR] Guard error ({event_type}): {e}")
        traceback.print_exc()
        # Fail open — let the message through if AIDR is unreachable
        return False, {"status": "aidr_error", "error": str(e)}

# ---------------------------------------------------------------------------
# LLM Provider Handlers
# ---------------------------------------------------------------------------
def call_openai(messages, api_key, model):
    """Call OpenAI Chat Completions API."""
    from openai import OpenAI
    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=2048,
    )
    return response.choices[0].message.content


def call_anthropic(messages, api_key, model):
    """Call Anthropic Messages API."""
    import anthropic
    client = anthropic.Anthropic(api_key=api_key)

    # Extract system prompt from messages
    system_prompt = ""
    user_messages = []
    for msg in messages:
        if msg["role"] == "system":
            system_prompt = msg["content"]
        else:
            user_messages.append(msg)

    response = client.messages.create(
        model=model,
        max_tokens=2048,
        system=system_prompt,
        messages=user_messages,
    )
    return response.content[0].text


def call_gemini(messages, api_key, model):
    """Call Google Gemini API using the new google-genai library."""
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)

    contents = []
    system_instruction = None

    for msg in messages:
        if msg["role"] == "system":
            system_instruction = msg["content"]
        else:
            role = "user" if msg["role"] == "user" else "model"
            contents.append(
                types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=msg["content"])]
                )
            )

    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
    ) if system_instruction else None

    response = client.models.generate_content(
        model=model,
        contents=contents,
        config=config,
    )
    
    return response.text


def call_groq(messages, api_key, model):
    """Call Groq's Chat Completions API (OpenAI-compatible)."""
    from openai import OpenAI
    client = OpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1")
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=2048,
    )
    return response.choices[0].message.content


def call_ollama(messages, ollama_url, model):
    """Call a self-hosted Ollama instance (OpenAI-compatible API)."""
    from openai import OpenAI
    base_url = f"{ollama_url.rstrip('/')}/v1"
    client = OpenAI(base_url=base_url, api_key="ollama")  # Ollama doesn't need a real key
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=2048,
    )
    return response.choices[0].message.content


# Provider dispatcher
PROVIDERS = {
    "openai": call_openai,
    "anthropic": call_anthropic,
    "gemini": call_gemini,
    "groq": call_groq,
    "ollama": call_ollama,
}


def call_llm(messages, settings):
    """Route to the correct LLM provider based on user settings."""
    provider = settings.get("provider", "openai")
    model = settings.get("model", "gpt-4o-mini")
    api_key = settings.get("api_key", "")
    ollama_url = settings.get("ollama_url", "http://localhost:11434")

    if provider == "ollama":
        return call_ollama(messages, ollama_url, model)
    elif provider in PROVIDERS:
        return PROVIDERS[provider](messages, api_key, model)
    else:
        raise ValueError(f"Unknown provider: {provider}")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    """Serve the chat page."""
    if "session_id" not in session:
        session["session_id"] = str(uuid.uuid4())
    return render_template("index.html")


# ---------------------------------------------------------------------------
# Chat Session CRUD
# ---------------------------------------------------------------------------
@app.route("/api/chats", methods=["GET"])
def list_chats():
    """Return all chat sessions (metadata only, no messages)."""
    chats = []
    for cid, s in chat_sessions.items():
        chats.append({
            "id": cid,
            "title": s.get("title", "New Chat"),
            "persona": s.get("persona", "customer_support"),
            "aidr_triggered": s.get("aidr_triggered", False),
            "aidr_block_count": s.get("aidr_block_count", 0),
            "message_count": len(s.get("messages", [])),
            "created_at": s.get("created_at"),
            "updated_at": s.get("updated_at"),
        })
    # Sort by updated_at descending (most recent first)
    chats.sort(key=lambda c: c.get("updated_at") or "", reverse=True)
    return jsonify({"chats": chats})


@app.route("/api/chats", methods=["POST"])
def create_chat():
    """Create a new chat session."""
    chat_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    persona_key = session.get("persona", "customer_support")
    chat_sessions[chat_id] = {
        "id": chat_id,
        "title": "New Chat",
        "messages": [],
        "persona": persona_key,
        "aidr_triggered": False,
        "aidr_block_count": 0,
        "created_at": now,
        "updated_at": now,
    }
    # Set as active chat
    session["active_chat_id"] = chat_id
    _save_chat_sessions()
    return jsonify({"id": chat_id, "title": "New Chat"})


@app.route("/api/chats/<chat_id>", methods=["GET"])
def get_chat(chat_id):
    """Load a specific chat session with full messages."""
    s = chat_sessions.get(chat_id)
    if not s:
        return jsonify({"error": "Chat not found"}), 404
    session["active_chat_id"] = chat_id
    return jsonify(s)


@app.route("/api/chats/<chat_id>", methods=["DELETE"])
def delete_chat(chat_id):
    """Delete a chat session."""
    if chat_id in chat_sessions:
        del chat_sessions[chat_id]
        _save_chat_sessions()
        # If this was the active chat, clear it
        if session.get("active_chat_id") == chat_id:
            session.pop("active_chat_id", None)
    return jsonify({"status": "ok"})


@app.route("/api/chats/<chat_id>/rename", methods=["POST"])
def rename_chat(chat_id):
    """Rename a chat session."""
    s = chat_sessions.get(chat_id)
    if not s:
        return jsonify({"error": "Chat not found"}), 404
    data = request.json or {}
    new_title = data.get("title", "").strip()
    if not new_title:
        return jsonify({"error": "Title is required"}), 400
    s["title"] = new_title[:80]
    _save_chat_sessions()
    return jsonify({"status": "ok", "title": s["title"]})


@app.route("/api/aidr-status", methods=["GET"])
def aidr_status():
    """Return whether AIDR is currently configured and connected."""
    return jsonify({
        "configured": aidr_client is not None,
    })


@app.route("/api/aidr-config", methods=["POST"])
def aidr_config():
    """Accept AIDR token + base URL from the UI and reinitialize the client."""
    global aidr_client
    data = request.json or {}
    token = data.get("token", "").strip()
    base_url = data.get("base_url", "").strip()

    if not token:
        return jsonify({"error": "AIDR token is required."}), 400

    if not base_url:
        base_url = os.getenv("AIDR_BASE_URL", "https://api.us-2.crowdstrike.com/aidr/aiguard")

    try:
        from crowdstrike_aidr import AIGuard
        aidr_client = AIGuard(
            base_url_template=base_url,
            token=token,
        )
        # Persist to env vars for this process (not to .env file)
        os.environ["AIDR_TOKEN"] = token
        os.environ["AIDR_BASE_URL"] = base_url
        print("[AIDR] ✅ AIGuard client re-initialized from UI settings.")
        return jsonify({"status": "ok", "configured": True})
    except Exception as e:
        print(f"[AIDR] ⚠️  Failed to re-initialize AIGuard from UI: {e}")
        return jsonify({"error": f"Failed to connect AIDR: {str(e)}"}), 500


@app.route("/api/settings", methods=["GET"])
def get_settings():
    """Get current session settings."""
    return jsonify({
        "provider": session.get("provider", "openai"),
        "model": session.get("model", "gpt-4o-mini"),
        "persona": session.get("persona", "customer_support"),
        "ollama_url": session.get("ollama_url", "http://localhost:11434"),
        "has_api_key": bool(session.get("api_key", "")),
    })


@app.route("/api/settings", methods=["POST"])
def save_settings():
    """Save settings to session."""
    data = request.json
    if "provider" in data:
        session["provider"] = data["provider"]
    if "model" in data:
        session["model"] = data["model"]
    if "persona" in data:
        session["persona"] = data["persona"]
    if "api_key" in data:
        session["api_key"] = data["api_key"]
    if "ollama_url" in data:
        session["ollama_url"] = data["ollama_url"]

    # Clear conversation when settings change
    active_chat_id = session.get("active_chat_id", "")
    if active_chat_id in chat_sessions:
        del chat_sessions[active_chat_id]
        session.pop("active_chat_id", None)
        _save_chat_sessions()

    return jsonify({"status": "ok"})


@app.route("/api/models", methods=["GET"])
def get_models():
    """Get available models for the selected provider."""
    provider = request.args.get("provider", session.get("provider", "openai"))

    if provider == "ollama":
        ollama_url = session.get("ollama_url", "http://localhost:11434")
        try:
            import requests as req
            resp = req.get(f"{ollama_url.rstrip('/')}/api/tags", timeout=5)
            resp.raise_for_status()
            data = resp.json()
            models = [m["name"] for m in data.get("models", [])]
            return jsonify({"models": models if models else ["llama3.2", "mistral", "codellama"]})
        except Exception as e:
            return jsonify({"models": ["llama3.2", "mistral", "codellama"], "error": str(e)})
    else:
        return jsonify({"models": DEFAULT_MODELS.get(provider, [])})


@app.route("/api/chat", methods=["POST"])
def chat():
    """
    Main chat endpoint.
    Flow: User message → AIDR input guard → LLM → AIDR output guard → response
    """
    import base64
    
    aidr_enabled = True
    chat_id = None
    
    if request.content_type and request.content_type.startswith('multipart/form-data'):
        aidr_enabled_str = request.form.get("aidr_enabled", "true")
        aidr_enabled = aidr_enabled_str.lower() == "true"
        user_message = request.form.get("message", "").strip()
        chat_id = request.form.get("chat_id", "").strip() or None
        uploaded_file = request.files.get("file")
        if uploaded_file:
            try:
                decoded_text = uploaded_file.read().decode("utf-8", errors="replace")
                file_name = uploaded_file.filename
                if not user_message:
                    user_message = f"Please analyze the attached file '{file_name}':\n\n--- Attachment: {file_name} ---\n{decoded_text}\n--- End Attachment ---"
                else:
                    user_message += f"\n\n--- Attachment: {file_name} ---\n{decoded_text}\n--- End Attachment ---"
            except Exception as e:
                print(f"Error reading multipart file: {e}")
                return jsonify({"error": "Failed to read uploaded file."}), 400
    else:
        data = request.get_json(silent=True) or {}
        aidr_enabled_str = str(data.get("aidr_enabled", "true"))
        aidr_enabled = aidr_enabled_str.lower() == "true"
        user_message = data.get("message", "").strip()
        chat_id = data.get("chat_id") or None
        file_data = data.get("file")

        if file_data:
            try:
                # content is like "data:text/plain;base64,U29tZSB0ZXh0"
                if "," in file_data.get("content", ""):
                    b64_str = file_data["content"].split(",")[1]
                else:
                    b64_str = file_data["content"]
                    
                decoded_bytes = base64.b64decode(b64_str)
                decoded_text = decoded_bytes.decode("utf-8", errors="replace")
                file_name = file_data.get("name", "uploaded_file")
                
                if not user_message:
                    user_message = f"Please analyze the attached file '{file_name}':\n\n--- Attachment: {file_name} ---\n{decoded_text}\n--- End Attachment ---"
                else:
                    user_message += f"\n\n--- Attachment: {file_name} ---\n{decoded_text}\n--- End Attachment ---"
            except Exception as e:
                print(f"Error parsing file: {e}")
                return jsonify({"error": "Failed to parse uploaded file. Right now, only text-based files (txt, csv, json, md, etc.) are supported."}), 400

    if not user_message:
        return jsonify({"error": "Empty message"}), 400

    # Get settings
    provider = session.get("provider", "openai")
    api_key = session.get("api_key", "")
    model = session.get("model", "gpt-4o-mini")
    persona_key = session.get("persona", "customer_support")
    ollama_url = session.get("ollama_url", "http://localhost:11434")

    # Validate API key (not needed for Ollama)
    if provider != "ollama" and not api_key:
        return jsonify({
            "error": f"No API key configured for {provider}. Please open Settings and add your API key.",
            "needs_setup": True,
        }), 400

    # Resolve the chat session
    if not chat_id or chat_id not in chat_sessions:
        # Auto-create a session if none provided
        chat_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        chat_sessions[chat_id] = {
            "id": chat_id,
            "title": "New Chat",
            "messages": [],
            "persona": persona_key,
            "aidr_triggered": False,
            "aidr_block_count": 0,
            "created_at": now,
            "updated_at": now,
        }

    chat_session = chat_sessions[chat_id]
    history = chat_session["messages"]

    # Build messages with persona system prompt
    persona = PERSONAS.get(persona_key, PERSONAS["customer_support"])
    messages = [{"role": "system", "content": persona["system_prompt"]}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    # --- AIDR Input Guard ---
    input_blocked = False
    input_details = None
    if aidr_enabled:
        input_blocked, input_details = aidr_guard(
            [{"role": "user", "content": user_message}],
            event_type="input",
            model=model,
            llm_provider=provider,
        )

        if input_blocked:
            # Track the AIDR block on the session
            chat_session["aidr_triggered"] = True
            chat_session["aidr_block_count"] = chat_session.get("aidr_block_count", 0) + 1
            chat_session["updated_at"] = datetime.now(timezone.utc).isoformat()
            # Auto-title from first message if still default
            if chat_session["title"] == "New Chat" and user_message:
                chat_session["title"] = user_message[:50] + ("…" if len(user_message) > 50 else "")
            _save_chat_sessions()
            return jsonify({
                "response": None,
                "blocked": True,
                "block_type": "input",
                "aidr": input_details,
                "chat_id": chat_id,
                "aidr_triggered": True,
                "message": "⚠️ Your message was blocked by CrowdStrike AIDR security. The input was flagged as potentially harmful.",
            })

    # --- Call LLM ---
    try:
        settings = {
            "provider": provider,
            "api_key": api_key,
            "model": model,
            "ollama_url": ollama_url,
        }
        ai_response = call_llm(messages, settings)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"LLM error: {str(e)}"}), 500

    # --- AIDR Output Guard ---
    output_blocked = False
    output_details = None
    if aidr_enabled:
        output_blocked, output_details = aidr_guard(
            [{"role": "assistant", "content": ai_response}],
            event_type="output",
            model=model,
            llm_provider=provider,
        )

        if output_blocked:
            # Still save user message to history
            history.append({"role": "user", "content": user_message})
            # Track the AIDR block
            chat_session["aidr_triggered"] = True
            chat_session["aidr_block_count"] = chat_session.get("aidr_block_count", 0) + 1
            chat_session["updated_at"] = datetime.now(timezone.utc).isoformat()
            if chat_session["title"] == "New Chat" and user_message:
                chat_session["title"] = user_message[:50] + ("…" if len(user_message) > 50 else "")
            _save_chat_sessions()
            return jsonify({
                "response": None,
                "blocked": True,
                "block_type": "output",
                "aidr": output_details,
                "chat_id": chat_id,
                "aidr_triggered": True,
                "message": "⚠️ The AI response was blocked by CrowdStrike AIDR security. The output was flagged as potentially harmful.",
            })

    # --- Success ---
    history.append({"role": "user", "content": user_message})
    history.append({"role": "assistant", "content": ai_response})

    # Auto-title from first user message
    if chat_session["title"] == "New Chat" and user_message:
        chat_session["title"] = user_message[:50] + ("…" if len(user_message) > 50 else "")

    chat_session["updated_at"] = datetime.now(timezone.utc).isoformat()

    # Keep history manageable (last 20 turns)
    if len(history) > 40:
        chat_session["messages"] = history[-40:]

    _save_chat_sessions()

    return jsonify({
        "response": ai_response,
        "blocked": False,
        "chat_id": chat_id,
        "chat_title": chat_session["title"],
        "aidr_triggered": chat_session.get("aidr_triggered", False),
        "aidr_input": input_details,
        "aidr_output": output_details,
    })


@app.route("/api/clear", methods=["POST"])
def clear_chat():
    """Clear the active chat's messages (keeps the session in history)."""
    chat_id = session.get("active_chat_id", "")
    if chat_id and chat_id in chat_sessions:
        chat_sessions[chat_id]["messages"] = []
        _save_chat_sessions()
    return jsonify({"status": "ok"})


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("\n🤖 AIDR Chatbot starting...")
    print(f"🛡️  AIDR Protection: {'ENABLED' if aidr_client else 'DISABLED'}")
    print(f"🌐 http://localhost:5000\n")
    app.run(host='0.0.0.0', port=5000, debug=True)
    //app.run(debug=True, port=5000)
