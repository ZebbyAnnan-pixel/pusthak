import { useState, useEffect, useRef } from 'react';
import {
  Brain,
  ArrowLeft,
  LogOut,
  Plus,
  FileText,
  Link as LinkIcon,
  Loader2,
  Send,
  Trash2,
  X,
  MessageSquare,
  Sparkles,
  Upload,
  File as FileIcon,
  Wand2,
  Lightbulb,
  Headphones,
  Copy,
  Check,
  Play,
  Pause,
  Volume2,
  BookOpen,
  Mic2,
  Globe,
} from 'lucide-react';
import { supabase, Notebook, Document, ChatMessage } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';

interface NotebookWorkspaceProps {
  notebook: Notebook;
  onBack: () => void;
  onSignOut: () => void;
}

const notebookColors: Record<string, string> = {
  blue: 'from-blue-500 to-cyan-500',
  emerald: 'from-emerald-500 to-teal-500',
  amber: 'from-amber-500 to-orange-500',
  rose: 'from-rose-500 to-pink-500',
  indigo: 'from-indigo-500 to-violet-500',
  slate: 'from-slate-600 to-slate-500',
};

type Tab = 'sources' | 'chat' | 'generate';

const voices = [
  {
    id: 'jessica',
    name: 'Jessica',
    language: 'English',
    accent: 'American',
    gender: 'Female',
    style: 'Warm & Professional',
    flag: '🇺🇸',
    supported: ['English', 'French', 'German', 'Spanish', 'Italian', 'Portuguese']
  },
  {
    id: 'akash',
    name: 'Akash',
    language: 'Hindi',
    accent: 'Indian',
    gender: 'Male',
    style: 'Clear & Engaging',
    flag: '🇮🇳',
    supported: ['Hindi', 'English', 'Bengali', 'Tamil', 'Telugu']
  },
  {
    id: 'anjali',
    name: 'Anjali',
    language: 'Hindi',
    accent: 'Indian',
    gender: 'Female',
    style: 'Soft & Natural',
    flag: '🇮🇳',
    supported: ['Hindi', 'English', 'Marathi', 'Gujarati']
  },
  {
    id: 'kanika',
    name: 'Kanika',
    language: 'Hindi',
    accent: 'Indian',
    gender: 'Female',
    style: 'Expressive Storyteller',
    flag: '🇮🇳',
    supported: ['Hindi', 'English', 'Punjabi', 'Urdu']
  },
  {
    id: 'maria',
    name: 'Maria',
    language: 'Spanish',
    accent: 'Castilian',
    gender: 'Female',
    style: 'Elegant & Clear',
    flag: '🇪🇸',
    supported: ['Spanish', 'Portuguese', 'Catalan', 'English']
  },
  {
    id: 'charlotte',
    name: 'Charlotte',
    language: 'French',
    accent: 'French',
    gender: 'Female',
    style: 'Sophisticated & Smooth',
    flag: '🇫🇷',
    supported: ['French', 'English', 'German', 'Dutch']
  },
  {
    id: 'hans',
    name: 'Hans',
    language: 'German',
    accent: 'German',
    gender: 'Male',
    style: 'Authoritative & Deep',
    flag: '🇩🇪',
    supported: ['German', 'English', 'Austrian German']
  },
  {
    id: 'yuki',
    name: 'Yuki',
    language: 'Japanese',
    accent: 'Japanese',
    gender: 'Female',
    style: 'Gentle & Articulate',
    flag: '🇯🇵',
    supported: ['Japanese', 'English']
  },
];

export default function NotebookWorkspace({ notebook, onBack, onSignOut }: NotebookWorkspaceProps) {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('sources');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addType, setAddType] = useState<'text' | 'link'>('text');
  const [docName, setDocName] = useState('');
  const [docContent, setDocContent] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [addingDoc, setAddingDoc] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Generation states
  const [genMode, setGenMode] = useState<'summary' | 'notes' | 'ideas' | 'podcast'>('summary');
  const [generating, setGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Podcast voice states
  const [selectedVoice, setSelectedVoice] = useState<string>('jessica');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    fetchDocuments();
    fetchMessages();
  }, [notebook.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function fetchDocuments() {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('notebook_id', notebook.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoadingDocs(false);
    }
  }

  async function fetchMessages() {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('notebook_id', notebook.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoadingMessages(false);
    }
  }

  async function addDocument() {
    if (addType === 'text' && (!docName.trim() || !docContent.trim())) return;
    if (addType === 'link' && (!docName.trim() || !docUrl.trim())) return;

    setAddingDoc(true);
    try {
      const payload: Omit<Document, 'id' | 'created_at' | 'updated_at'> = {
        notebook_id: notebook.id,
        user_id: user!.id,
        name: docName.trim(),
        type: addType,
        content: addType === 'text' ? docContent.trim() : docUrl.trim(),
        file_url: null,
        status: 'ready',
      };

      const { data, error } = await supabase
        .from('documents')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      setDocuments([data, ...documents]);
      setShowAddModal(false);
      setDocName('');
      setDocContent('');
      setDocUrl('');
    } catch (error) {
      console.error('Error adding document:', error);
    } finally {
      setAddingDoc(false);
    }
  }

  async function handleFileUpload(file: File) {
    setUploadingFile(true);
    try {
      const filePath = `${user!.id}/${notebook.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      const fileType: Document['type'] = file.type.startsWith('image/')
        ? 'image'
        : 'file';

      const { data, error } = await supabase
        .from('documents')
        .insert({
          notebook_id: notebook.id,
          user_id: user!.id,
          name: file.name,
          type: fileType,
          content: null,
          file_url: urlData.publicUrl,
          status: 'ready',
        })
        .select()
        .single();

      if (error) throw error;
      setDocuments([data, ...documents]);
    } catch (error) {
      console.error('Error uploading file:', error);
    } finally {
      setUploadingFile(false);
    }
  }

  async function deleteDocument(id: string) {
    try {
      const { error } = await supabase.from('documents').delete().eq('id', id);
      if (error) throw error;
      setDocuments(documents.filter((d) => d.id !== id));
    } catch (error) {
      console.error('Error deleting document:', error);
    }
  }

  async function sendMessage() {
    const question = chatInput.trim();
    if (!question || chatSending) return;

    setChatSending(true);
    setChatInput('');

    const tempUserMsg: ChatMessage = {
      id: 'temp-user',
      notebook_id: notebook.id,
      user_id: user!.id,
      role: 'user',
      content: question,
      citations: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const sources = documents.map((d) => ({
        name: d.name,
        type: d.type,
        content: d.content,
        file_url: d.file_url,
      }));

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ question, sources }),
        },
      );
      const data = await res.json();

      const assistantMsg: ChatMessage = {
        id: 'temp-assistant',
        notebook_id: notebook.id,
        user_id: user!.id,
        role: 'assistant',
        content: data.answer || 'Sorry, I could not generate a response.',
        citations: data.citations || null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      const { error: insertError } = await supabase.from('chat_messages').insert([
        {
          notebook_id: notebook.id,
          user_id: user!.id,
          role: 'user',
          content: question,
          citations: null,
        },
        {
          notebook_id: notebook.id,
          user_id: user!.id,
          role: 'assistant',
          content: assistantMsg.content,
          citations: assistantMsg.citations,
        },
      ]);
      if (insertError) throw insertError;

      setMessages((prev) =>
        prev.filter((m) => m.id !== 'temp-user' && m.id !== 'temp-assistant'),
      );
      await fetchMessages();
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) => prev.filter((m) => m.id !== 'temp-user'));
    } finally {
      setChatSending(false);
    }
  }

  async function generateContent() {
    if (documents.length === 0 || generating) return;

    setGenerating(true);
    setGeneratedContent(null);

    try {
      const sources = documents.map((d) => ({
        name: d.name,
        type: d.type,
        content: d.content,
        file_url: d.file_url,
      }));

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            question: `GENERATE_${genMode.toUpperCase()}`,
            sources,
            language: voices.find(v => v.id === selectedVoice)?.language || 'English'
          }),
        },
      );
      const data = await res.json();
      setGeneratedContent(data.answer || 'Could not generate content.');
    } catch (error) {
      console.error('Error generating content:', error);
      setGeneratedContent('An error occurred while generating content.');
    } finally {
      setGenerating(false);
    }
  }

  function copyToClipboard() {
    if (generatedContent) {
      navigator.clipboard.writeText(generatedContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function generatePodcastAudio() {
    if (!generatedContent || generatingAudio) return;

    setGeneratingAudio(true);
    setAudioUrl(null);

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/podcast-narrate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ text: generatedContent, voice: selectedVoice }),
        },
      );

      if (!res.ok) {
        const errorData = await res.json();
        console.error('API Error:', errorData);
        throw new Error(errorData.error || errorData.details || 'Failed to generate audio');
      }

      const audioBlob = await res.blob();
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);
    } catch (error) {
      console.error('Error generating audio:', error);
      alert(`Failed to generate podcast audio: ${error.message || 'Unknown error'}. Check console for details.`);
    } finally {
      setGeneratingAudio(false);
    }
  }

  function togglePlayPause() {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  }

  const gradient = notebookColors[notebook.color] || notebookColors.blue;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={onBack}
                className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
                title="Back to notebooks"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0`}>
                <Brain className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="font-bold text-lg text-slate-900 truncate">{notebook.name}</h1>
                {notebook.description && (
                  <p className="text-xs text-slate-500 truncate">{notebook.description}</p>
                )}
              </div>
            </div>

            <button
              onClick={onSignOut}
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
              title="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1 overflow-x-auto">
            <button
              onClick={() => setActiveTab('sources')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'sources'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <FileText className="w-4 h-4" />
              Sources
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'chat'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              Chat
            </button>
            <button
              onClick={() => setActiveTab('generate')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'generate'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              Magic Studio
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'sources' ? (
          <SourcesView
            documents={documents}
            loading={loadingDocs}
            onAdd={() => setShowAddModal(true)}
            onDelete={deleteDocument}
            onFileUpload={handleFileUpload}
            uploadingFile={uploadingFile}
          />
        ) : activeTab === 'chat' ? (
          <ChatView
            messages={messages}
            loading={loadingMessages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            onSend={sendMessage}
            sending={chatSending}
            messagesEndRef={messagesEndRef}
            hasSources={documents.length > 0}
          />
        ) : (
          <GenerateView
            mode={genMode}
            setMode={setGenMode}
            generating={generating}
            generatedContent={generatedContent}
            onGenerate={generateContent}
            onCopy={copyToClipboard}
            copied={copied}
            hasSources={documents.length > 0}
            selectedVoice={selectedVoice}
            setSelectedVoice={setSelectedVoice}
            audioUrl={audioUrl}
            generatingAudio={generatingAudio}
            onGenerateAudio={generatePodcastAudio}
            isPlaying={isPlaying}
            onTogglePlay={togglePlayPause}
            audioRef={audioRef}
          />
        )}
      </main>

      {/* Add Document Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900">Add Source</h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setDocName('');
                  setDocContent('');
                  setDocUrl('');
                }}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="space-y-5">
              <div className="flex gap-2">
                <button
                  onClick={() => setAddType('text')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-colors ${
                    addType === 'text'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Text
                </button>
                <button
                  onClick={() => setAddType('link')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-colors ${
                    addType === 'link'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <LinkIcon className="w-4 h-4" />
                  Link
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Name</label>
                <input
                  type="text"
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  placeholder="e.g., Research Paper"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {addType === 'text' ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Content</label>
                  <textarea
                    value={docContent}
                    onChange={(e) => setDocContent(e.target.value)}
                    placeholder="Paste your text here..."
                    rows={5}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">URL</label>
                  <input
                    type="url"
                    value={docUrl}
                    onChange={(e) => setDocUrl(e.target.value)}
                    placeholder="https://example.com/article"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setDocName('');
                    setDocContent('');
                    setDocUrl('');
                  }}
                  className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={addDocument}
                  disabled={addingDoc || !docName.trim() || (addType === 'text' ? !docContent.trim() : !docUrl.trim())}
                  className="flex-1 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {addingDoc ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Add</span>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SourcesView({
  documents,
  loading,
  onAdd,
  onDelete,
  onFileUpload,
  uploadingFile,
}: {
  documents: Document[];
  loading: boolean;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onFileUpload: (file: File) => void;
  uploadingFile: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function getIcon(type: string) {
    switch (type) {
      case 'link':
        return <LinkIcon className="w-5 h-5" />;
      case 'image':
        return <FileIcon className="w-5 h-5" />;
      default:
        return <FileText className="w-5 h-5" />;
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <button
          onClick={onAdd}
          className="flex items-center justify-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-semibold hover:bg-slate-800 transition-all hover:scale-[1.02]"
        >
          <Plus className="w-5 h-5" />
          <span>Add Text / Link</span>
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingFile}
          className="flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-700 px-6 py-3 rounded-xl font-semibold hover:bg-slate-50 transition-all disabled:opacity-50"
        >
          {uploadingFile ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
          <span>Upload File</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileUpload(file);
            e.target.value = '';
          }}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-20">
          <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">No sources yet</h3>
          <p className="text-slate-600 mb-6">Add text, links, or files to give your AI assistant context</p>
          <button
            onClick={onAdd}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Source
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="group bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-slate-300 transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 flex-shrink-0">
                    {getIcon(doc.type)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium text-slate-900 truncate">{doc.name}</h3>
                    <p className="text-xs text-slate-500 capitalize mt-0.5">{doc.type}</p>
                  </div>
                </div>
                <button
                  onClick={() => onDelete(doc.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {doc.content && doc.type === 'text' && (
                <p className="text-sm text-slate-600 mt-3 line-clamp-3">{doc.content}</p>
              )}
              {doc.type === 'link' && doc.content && (
                <a
                  href={doc.content}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline mt-3 block truncate"
                >
                  {doc.content}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChatView({
  messages,
  loading,
  chatInput,
  setChatInput,
  onSend,
  sending,
  messagesEndRef,
  hasSources,
}: {
  messages: ChatMessage[];
  loading: boolean;
  chatInput: string;
  setChatInput: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  hasSources: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-220px)]">
      {!hasSources && (
        <div className="mb-4 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <Sparkles className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            Add sources first so the AI can answer questions about your content.
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">Start a conversation</h3>
            <p className="text-slate-600 max-w-sm">
              Ask questions about your sources and the AI will answer using the content you've added.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-800'
                }`}
              >
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-200/50 space-y-1">
                    <p className="text-xs font-medium opacity-70 mb-1">Sources cited:</p>
                    {msg.citations.map((c, i) => (
                      <p key={i} className="text-xs opacity-80">• {c.source}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-2xl px-4 py-3">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="mt-4 flex gap-2">
        <input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="Ask a question about your sources..."
          className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          onClick={onSend}
          disabled={sending || !chatInput.trim()}
          className="px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center"
        >
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}

function GenerateView({
  mode,
  setMode,
  generating,
  generatedContent,
  onGenerate,
  onCopy,
  copied,
  hasSources,
  selectedVoice,
  setSelectedVoice,
  audioUrl,
  generatingAudio,
  onGenerateAudio,
  isPlaying,
  onTogglePlay,
  audioRef,
}: {
  mode: 'summary' | 'notes' | 'ideas' | 'podcast';
  setMode: (m: 'summary' | 'notes' | 'ideas' | 'podcast') => void;
  generating: boolean;
  generatedContent: string | null;
  onGenerate: () => void;
  onCopy: () => void;
  copied: boolean;
  hasSources: boolean;
  selectedVoice: string;
  setSelectedVoice: (v: string) => void;
  audioUrl: string | null;
  generatingAudio: boolean;
  onGenerateAudio: () => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  audioRef: React.RefObject<HTMLAudioElement>;
}) {
  const modes = [
    {
      id: 'summary',
      label: 'Smart Summary',
      icon: Wand2,
      color: 'from-violet-500 to-purple-600',
      bgColor: 'bg-violet-50',
      description: 'Distill your sources into key insights',
      tag: 'Popular'
    },
    {
      id: 'notes',
      label: 'Study Notes',
      icon: BookOpen,
      color: 'from-blue-500 to-indigo-600',
      bgColor: 'bg-blue-50',
      description: 'Transform content into organized notes',
      tag: null
    },
    {
      id: 'ideas',
      label: 'Idea Explorer',
      icon: Lightbulb,
      color: 'from-amber-400 to-orange-500',
      bgColor: 'bg-amber-50',
      description: 'Uncover hidden connections & insights',
      tag: null
    },
    {
      id: 'podcast',
      label: 'AI Podcast',
      icon: Mic2,
      color: 'from-emerald-500 to-teal-600',
      bgColor: 'bg-emerald-50',
      description: 'Turn research into an engaging narrated podcast',
      tag: 'New'
    },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-slate-900 mb-2 flex items-center justify-center gap-2">
          <Sparkles className="w-7 h-7 text-purple-500" />
          Magic Studio
        </h2>
        <p className="text-slate-600">Transform your research with AI-powered tools</p>
      </div>

      {!hasSources && (
        <div className="flex items-start gap-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-amber-900 mb-1">No sources yet</h3>
            <p className="text-sm text-amber-800">
              Add some sources first to unlock the magic! Upload documents, add text, or paste links.
            </p>
          </div>
        </div>
      )}

      {/* Mode Selection Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {modes.map((m) => {
          const Icon = m.icon;
          const isSelected = mode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              disabled={!hasSources}
              className={`relative group p-5 rounded-2xl border-2 transition-all text-left overflow-hidden ${
                isSelected
                  ? `${m.bgColor} border-slate-900 shadow-lg scale-[1.02]`
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md'
              } ${!hasSources ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {m.tag && (
                <span className={`absolute top-3 right-3 px-2 py-0.5 text-xs font-semibold rounded-full ${
                  m.tag === 'New' ? 'bg-emerald-500 text-white' : 'bg-purple-500 text-white'
                }`}>
                  {m.tag}
                </span>
              )}
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${m.color} flex items-center justify-center mb-4 shadow-md group-hover:scale-110 transition-transform`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-bold text-slate-900 mb-1">{m.label}</h3>
              <p className="text-sm text-slate-500">{m.description}</p>
            </button>
          );
        })}
      </div>

      {/* Voice Selection for Podcast */}
      {mode === 'podcast' && hasSources && (
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border border-emerald-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Choose Your Narrator</h3>
              <p className="text-sm text-slate-600">Multilingual AI voices powered by ElevenLabs</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {voices.map((voice) => (
              <button
                key={voice.id}
                onClick={() => setSelectedVoice(voice.id)}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  selectedVoice === voice.id
                    ? 'border-emerald-500 bg-white shadow-md'
                    : 'border-transparent bg-white/60 hover:bg-white hover:border-emerald-200'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{voice.flag}</span>
                  <div>
                    <span className="font-semibold text-slate-900">{voice.name}</span>
                    <span className="text-xs text-slate-500 ml-1">{voice.gender === 'Male' ? '♂' : '♀'}</span>
                  </div>
                </div>
                <p className="text-xs font-medium text-emerald-700 mb-1">{voice.language}</p>
                <p className="text-xs text-slate-500">{voice.style}</p>
              </button>
            ))}
          </div>

          {/* Language Support Info */}
          <div className="mt-4 p-3 bg-white/50 rounded-xl">
            <p className="text-xs text-slate-600">
              <strong>Selected voice supports:</strong> {voices.find(v => v.id === selectedVoice)?.supported.join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Generate Button */}
      <div className="flex justify-center">
        <button
          onClick={onGenerate}
          disabled={generating || !hasSources}
          className="group relative px-10 py-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl font-bold text-lg hover:from-slate-800 hover:to-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl hover:shadow-2xl hover:scale-[1.02]"
        >
          <span className="flex items-center gap-3">
            {generating ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>Creating Magic...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-6 h-6 group-hover:rotate-12 transition-transform" />
                <span>Create {modes.find(m => m.id === mode)?.label}</span>
              </>
            )}
          </span>
        </button>
      </div>

      {/* Generated Content */}
      {generatedContent && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              {modes.find(m => m.id === mode)?.label}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={onCopy}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all ${
                  copied
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
          <div className="p-6">
            <div className="prose prose-slate max-w-none">
              {generatedContent.split('\n').map((paragraph, idx) => (
                paragraph.trim() ? (
                  <p key={idx} className="mb-4 last:mb-0 text-slate-700 leading-relaxed">
                    {paragraph}
                  </p>
                ) : null
              ))}
            </div>
          </div>

          {/* Podcast Audio Section */}
          {mode === 'podcast' && (
            <div className="px-6 pb-6">
              <div className="border-t border-slate-200 pt-5">
                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  <button
                    onClick={onGenerateAudio}
                    disabled={generatingAudio || generating}
                    className="flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-6 py-3 rounded-xl font-semibold hover:from-emerald-600 hover:to-teal-700 transition-all disabled:opacity-50 shadow-md hover:shadow-lg"
                  >
                    {generatingAudio ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Generating Audio...</span>
                      </>
                    ) : (
                      <>
                        <Headphones className="w-5 h-5" />
                        <span>Generate Narration</span>
                      </>
                    )}
                  </button>

                  {audioUrl && (
                    <div className="flex items-center gap-4 flex-1 bg-slate-100 rounded-xl p-3">
                      <button
                        onClick={onTogglePlay}
                        className="flex items-center justify-center w-14 h-14 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-full hover:from-slate-800 hover:to-slate-700 transition-all shadow-lg hover:scale-105"
                      >
                        {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
                      </button>
                      <div className="flex-1">
                        <audio
                          ref={audioRef}
                          src={audioUrl}
                          onEnded={() => onTogglePlay()}
                          className="w-full hidden"
                        />
                        <p className="font-medium text-slate-900">
                          {isPlaying ? 'Now Playing...' : 'Ready to Play'}
                        </p>
                        <p className="text-sm text-slate-500">
                          {voices.find(v => v.id === selectedVoice)?.name} ({voices.find(v => v.id === selectedVoice)?.language})
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!generating && !generatedContent && hasSources && (
        <div className="flex flex-col items-center justify-center py-16 bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl border border-slate-200">
          <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${modes.find(m => m.id === mode)?.color} flex items-center justify-center mb-5 shadow-lg`}>
            {(() => {
              const Icon = modes.find(m => m.id === mode)?.icon || Wand2;
              return <Icon className="w-10 h-10 text-white" />;
            })()}
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">
            Ready to Create {modes.find(m => m.id === mode)?.label}
          </h3>
          <p className="text-slate-600 max-w-md text-center">
            Your sources are loaded and ready. Click the button above to transform them with AI magic!
          </p>
        </div>
      )}
    </div>
  );
}
