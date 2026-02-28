'use client';

import React, { useState } from 'react';

type ParsedNode = {
    type: string;
    id: string;
    text?: string;
    href?: string;
    src?: string;
    alt?: string;
    level?: number;
    action?: string;
    method?: string;
    fields?: any[];
};

type DownloadState = {
    id: string;
    url: string;
    filename: string;
    progress: number;
    status: 'downloading' | 'done' | 'error';
    error?: string;
};

export default function DOSBrowser() {
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [nodes, setNodes] = useState<ParsedNode[]>([]);
    const [asciiImages, setAsciiImages] = useState<Record<string, string>>({});
    const [formData, setFormData] = useState<Record<string, Record<string, string>>>({});
    const [jsonOutput, setJsonOutput] = useState<string | null>(null);
    const [theme, setTheme] = useState<'green' | 'white'>('green');
    const [showAscii, setShowAscii] = useState(true);
    const [readerMode, setReaderMode] = useState(false);
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});

    const t = {
        textMain: theme === 'white' ? 'text-gray-200' : 'text-green-500',
        textLight: theme === 'white' ? 'text-white' : 'text-green-400',
        textDark: theme === 'white' ? 'text-gray-500' : 'text-green-700',
        bgMain: theme === 'white' ? 'bg-gray-700' : 'bg-green-800',
        bgHover: theme === 'white' ? 'hover:bg-gray-600' : 'hover:bg-green-700',
        borderMain: theme === 'white' ? 'border-gray-500' : 'border-green-600',
        borderDark: theme === 'white' ? 'border-gray-700' : 'border-green-800',
        borderHeader: theme === 'white' ? 'border-gray-600' : 'border-green-700',
        focusBorder: theme === 'white' ? 'focus:border-gray-400' : 'focus:border-green-400',
        selection: theme === 'white' ? 'selection:bg-gray-700' : 'selection:bg-green-900',
        shadow: theme === 'white' ? 'shadow-[0_0_15px_rgba(255,255,255,0.2)]' : 'shadow-[0_0_15px_rgba(34,197,94,0.3)]',
        headerText: theme === 'white' ? 'text-gray-300' : 'text-yellow-400',
        linkText: theme === 'white' ? 'text-blue-300 hover:text-blue-200' : 'text-cyan-400 hover:text-cyan-300',
        buttonBg: theme === 'white' ? 'bg-gray-800 hover:bg-gray-700' : 'bg-green-900 hover:bg-green-800',
        buttonBorder: theme === 'white' ? 'border-gray-500' : 'border-green-600',
        buttonText: theme === 'white' ? 'text-gray-200' : 'text-green-400',
        formBorder: theme === 'white' ? 'border-gray-500' : 'border-blue-500',
        formBg: theme === 'white' ? 'bg-gray-800' : 'bg-gray-900',
        formHeaderText: theme === 'white' ? 'text-gray-300' : 'text-blue-400',
        formInputBg: theme === 'white' ? 'bg-black' : 'bg-black',
        formInputText: theme === 'white' ? 'text-gray-200' : 'text-green-400',
        formInputBorder: theme === 'white' ? 'border-gray-600' : 'border-green-800',
        submitBg: theme === 'white' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-blue-800 hover:bg-blue-700',
        submitBorder: theme === 'white' ? 'border-gray-500' : 'border-blue-400',
        submitText: theme === 'white' ? 'text-white' : 'text-white',
        pulseError: theme === 'white' ? 'bg-red-800 text-red-100 border-red-400' : 'bg-red-900 text-red-100 border-red-500'
    };

    const fetchUrl = async (e?: React.FormEvent, overrideUrl?: string, isHistoryNav = false) => {
        if (e) e.preventDefault();
        const urlToFetch = overrideUrl || url;
        if (!urlToFetch) return;

        // Add https:// if no protocol is specified
        const targetUrl = urlToFetch.startsWith('http') ? urlToFetch : `https://${urlToFetch}`;
        setUrl(targetUrl);

        if (!isHistoryNav) {
            let newHistory = [...history];
            if (historyIndex < newHistory.length - 1) {
                newHistory = newHistory.slice(0, historyIndex + 1);
            }
            if (newHistory.length === 0 || newHistory[newHistory.length - 1] !== targetUrl) {
                newHistory.push(targetUrl);
                setHistory(newHistory);
                setHistoryIndex(newHistory.length - 1);
            }
        }

        setLoading(true);
        setError(null);
        setNodes([]);
        setAsciiImages({});
        setJsonOutput(null);

        try {
            const res = await fetch(`/api/browse?url=${encodeURIComponent(targetUrl)}&readerMode=${readerMode}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to fetch the webpage');
            }

            setNodes(data.data);

            // Pre-fetch all images for ASCII art
            const imgNodes = data.data.filter((n: ParsedNode) => n.type === 'image' && n.src);

            imgNodes.forEach(async (node: ParsedNode) => {
                try {
                    const asciiRes = await fetch(`/api/ascii?url=${encodeURIComponent(node.src!)}`);
                    if (asciiRes.ok) {
                        const asciiData = await asciiRes.json();
                        setAsciiImages(prev => ({ ...prev, [node.id]: asciiData.ascii }));
                    } else {
                        setAsciiImages(prev => ({ ...prev, [node.id]: '[IMAGE LOAD ERROR]' }));
                    }
                } catch (e) {
                    setAsciiImages(prev => ({ ...prev, [node.id]: '[IMAGE RENDER ERROR]' }));
                }
            });

        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const goBack = () => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            fetchUrl(undefined, history[newIndex], true);
        }
    };

    const goForward = () => {
        if (historyIndex < history.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            fetchUrl(undefined, history[newIndex], true);
        }
    };

    const startDownload = async (url: string, filename: string) => {
        const downloadId = Date.now().toString() + Math.random().toString(36).substr(2, 5);

        setDownloads(prev => ({
            ...prev,
            [downloadId]: { id: downloadId, url, filename, progress: 0, status: 'downloading' }
        }));

        try {
            const res = await fetch(`/api/download?url=${encodeURIComponent(url)}`);
            if (!res.ok) throw new Error('Download request failed');

            const contentLength = res.headers.get('content-length');
            const total = contentLength ? parseInt(contentLength, 10) : 0;

            let loaded = 0;
            const reader = res.body?.getReader();
            const chunks: BlobPart[] = [];

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (value) {
                        chunks.push(new Uint8Array(value));
                        loaded += value.length;
                        if (total) {
                            const progress = Math.round((loaded / total) * 100);
                            setDownloads(prev => ({
                                ...prev,
                                [downloadId]: { ...prev[downloadId], progress }
                            }));
                        } else {
                            setDownloads(prev => ({
                                ...prev,
                                [downloadId]: { ...prev[downloadId], progress: Math.min(99, prev[downloadId].progress + 5) }
                            }));
                        }
                    }
                }
            }

            const blob = new Blob(chunks, { type: res.headers.get('content-type') || 'application/octet-stream' });
            const objectUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(objectUrl);

            setDownloads(prev => ({
                ...prev,
                [downloadId]: { ...prev[downloadId], progress: 100, status: 'done' }
            }));

            setTimeout(() => {
                setDownloads(prev => {
                    const newD = { ...prev };
                    delete newD[downloadId];
                    return newD;
                });
            }, 6000);

        } catch (e: any) {
            setDownloads(prev => ({
                ...prev,
                [downloadId]: { ...prev[downloadId], status: 'error', error: e.message }
            }));
        }
    };

    const handleInputChange = (formId: string, name: string, value: string) => {
        setFormData(prev => ({
            ...prev,
            [formId]: {
                ...(prev[formId] || {}),
                [name]: value
            }
        }));
    };

    const handleFormSubmit = (e: React.FormEvent, formId: string) => {
        e.preventDefault();
        const data = formData[formId] || {};

        // In a real DOS browser, this might send data.
        // However, the prompt specifically requested returning a JSON of entered fields.
        const output = JSON.stringify({ formId, submittedData: data }, null, 2);
        setJsonOutput(output);
    };

    const exportPageJson = () => {
        const jsonStr = JSON.stringify(nodes, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const href = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = href;
        link.download = 'page_structure.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(href);
    };

    const renderNode = (node: ParsedNode) => {
        switch (node.type) {
            case 'header':
                const prefix = '#'.repeat(node.level || 1);
                return <div key={node.id} className={`${t.headerText} font-bold mt-4 mb-2`}>{prefix} {node.text}</div>;

            case 'text':
                return <div key={node.id} className="mb-2">{node.text}</div>;

            case 'link':
                return (
                    <button key={node.id}
                        onClick={() => { if (node.href) fetchUrl(undefined, node.href); }}
                        className={`${t.linkText} underline block mb-2 cursor-pointer text-left`}>
                        [{node.text}]
                    </button>
                );

            case 'download':
                return (
                    <button key={node.id}
                        type="button"
                        onClick={() => startDownload(node.href!, node.text || 'file')}
                        className={`bg-yellow-900 text-yellow-400 border-4 border-double border-yellow-500 hover:bg-yellow-800 hover:text-yellow-200 px-6 py-2 my-4 mx-auto block w-fit text-center font-bold`}
                    >
                        [ V ] QUEUE DOWNLOAD: {node.text}
                    </button>
                );

            case 'button':
                return (
                    <button key={node.id} className={`${t.buttonBg} ${t.buttonText} border-2 ${t.buttonBorder} px-4 py-1 mb-2 active:border-white`}>
                        &lt; {node.text} &gt;
                    </button>
                );

            case 'image':
                return (
                    <div key={node.id} className={`border border-dashed ${t.borderMain} p-2 mb-4 inline-block`}>
                        <div className={`${t.textDark} mb-1 text-xs`}>IMG: {node.alt || 'Unknown'} - {node.src}</div>
                        {showAscii && (
                            <pre className={`font-mono text-[10px] leading-[10px] ${t.textMain} whitespace-pre overflow-x-auto`}>
                                {asciiImages[node.id] || 'Loading image data...'}
                            </pre>
                        )}
                    </div>
                );

            case 'form':
                return (
                    <div key={node.id} className={`border ${t.formBorder} p-4 mb-4 ${t.formBg}`}>
                        <div className={`${t.formHeaderText} mb-2 font-bold`}>--- FORM ---</div>
                        <div className={`${t.textDark} text-xs mb-4`}>Action: {node.action} | Method: {node.method?.toUpperCase()}</div>

                        <form onSubmit={(e) => handleFormSubmit(e, node.id)} className="flex flex-col gap-2">
                            {node.fields?.map((field, i) => (
                                <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2">
                                    <span className={`${t.textLight} w-32 shrink-0`}>{field.name}:</span>

                                    {field.type === 'select' ? (
                                        <select
                                            className={`${t.formInputBg} ${t.formInputText} border ${t.formInputBorder} outline-none p-1 flex-1`}
                                            onChange={(e) => handleInputChange(node.id, field.name, e.target.value)}
                                            defaultValue=""
                                        >
                                            <option value="" disabled>Select option...</option>
                                            {field.options?.map((opt: any, j: number) => (
                                                <option key={j} value={opt.value}>{opt.text || opt.value}</option>
                                            ))}
                                        </select>
                                    ) : field.type === 'textarea' ? (
                                        <textarea
                                            className={`${t.formInputBg} ${t.formInputText} border ${t.formInputBorder} outline-none p-1 flex-1 min-h-[60px]`}
                                            placeholder={field.placeholder}
                                            onChange={(e) => handleInputChange(node.id, field.name, e.target.value)}
                                        />
                                    ) : (
                                        <input
                                            type={field.inputType || 'text'}
                                            className={`${t.formInputBg} ${t.formInputText} border ${t.formInputBorder} outline-none p-1 flex-1 ${t.focusBorder}`}
                                            placeholder={field.placeholder}
                                            onChange={(e) => handleInputChange(node.id, field.name, e.target.value)}
                                        />
                                    )}
                                </div>
                            ))}
                            <div className="mt-4 flex gap-4">
                                <button type="submit" className={`${t.submitBg} ${t.submitText} border-2 ${t.submitBorder} px-4 py-1`}>
                                    [ SUBMIT FORM JSON ]
                                </button>
                            </div>
                        </form>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className={`min-h-screen bg-black ${t.textMain} font-mono p-4 ${t.selection} overflow-x-hidden relative`}>
            {/* Header bar */}
            <div className={`border-b-2 ${t.borderHeader} pb-4 mb-6 pt-4`}>
                <div className="absolute top-4 right-4 z-10 flex gap-2">
                    <button
                        onClick={() => setReaderMode(!readerMode)}
                        className={`px-3 py-1 text-xs border uppercase font-bold transition-colors ${t.borderMain} ${t.textMain} ${t.bgHover} hover:text-black`}
                    >
                        READER: {readerMode ? 'ON' : 'OFF'}
                    </button>
                    <button
                        onClick={() => setShowAscii(!showAscii)}
                        className={`px-3 py-1 text-xs border uppercase font-bold transition-colors ${t.borderMain} ${t.textMain} ${t.bgHover} hover:text-black`}
                    >
                        ASCII: {showAscii ? 'ON' : 'OFF'}
                    </button>
                    <button
                        onClick={() => setTheme(theme === 'green' ? 'white' : 'green')}
                        className={`px-3 py-1 text-xs border uppercase font-bold transition-colors ${theme === 'white' ? 'border-gray-300 text-gray-300 hover:bg-gray-300 hover:text-black' : 'border-green-500 text-green-500 hover:bg-green-500 hover:text-black'}`}
                    >
                        THEME: {theme}
                    </button>
                </div>

                <h1 className={`${t.textLight} text-2xl font-bold text-center mb-4 tracking-widest uppercase`}>
                    Website zo JSON Browser
                </h1>

                <form onSubmit={(e) => fetchUrl(e)} className="flex gap-2 w-full max-w-4xl mx-auto">
                    <button
                        type="button"
                        onClick={goBack}
                        disabled={historyIndex <= 0}
                        className={`text-xs px-2 border font-bold transition-colors ${t.borderMain} ${t.textMain} ${t.bgHover} disabled:opacity-30 disabled:cursor-not-allowed hidden sm:block`}
                    >
                        &lt; BACK
                    </button>
                    <button
                        type="button"
                        onClick={goForward}
                        disabled={historyIndex >= history.length - 1}
                        className={`text-xs px-2 border font-bold transition-colors ${t.borderMain} ${t.textMain} ${t.bgHover} disabled:opacity-30 disabled:cursor-not-allowed hidden sm:block`}
                    >
                        FORWARD &gt;
                    </button>
                    <span className={`${t.headerText} self-center text-xl ml-2`}>&gt;</span>
                    <input
                        type="text"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="ENTER URL (e.g. example.com)..."
                        className={`flex-1 bg-black ${t.textLight} border ${t.borderMain} p-2 outline-none ${t.focusBorder} focus:bg-gray-900 text-lg uppercase`}
                    />
                    <button
                        type="submit"
                        disabled={loading}
                        className={`${t.bgMain} text-black font-bold px-6 border-2 ${t.borderMain} ${t.bgHover} disabled:opacity-50`}
                    >
                        {loading ? 'LOADING...' : 'GO'}
                    </button>
                </form>
            </div>

            {/* Main Content Area */}
            <div className="max-w-4xl mx-auto">
                {Object.keys(downloads).length > 0 && (
                    <div className={`mb-6 p-4 border-2 border-yellow-600 bg-yellow-900/30`}>
                        <div className="text-yellow-500 font-bold mb-2">--- ACTIVE DOWNLOADS ---</div>
                        {Object.values(downloads).map(dl => {
                            const barLength = 20;
                            const filled = Math.round((dl.progress / 100) * barLength);
                            const empty = barLength - filled;
                            const isDl = dl.status === 'downloading';
                            const pBar = `[${'='.repeat(filled)}${isDl && filled < barLength ? '>' : ''}${' '.repeat(Math.max(0, empty - (isDl && filled < barLength ? 1 : 0)))}]`;

                            return (
                                <div key={dl.id} className="text-yellow-400 font-mono text-sm mb-2">
                                    <div className="truncate">{dl.filename}</div>
                                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mt-1">
                                        <span>{pBar} {dl.progress}%</span>
                                        <span className={dl.status === 'error' ? 'text-red-400' : dl.status === 'done' ? 'text-green-400' : ''}>
                                            {dl.status === 'error' ? `[ERROR: ${dl.error}]` : dl.status === 'done' ? '[COMPLETED]' : '[DOWNLOADING]'}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {error && (
                    <div className={`${t.pulseError} p-4 border-2 mb-6 font-bold animate-pulse`}>
                        ERROR: {error}
                    </div>
                )}

                {/* Global JSON Export / Form Output Modal */}
                {jsonOutput && (
                    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center p-4 z-50">
                        <div className="bg-blue-900 border-4 border-white p-6 max-w-2xl w-full max-h-[80vh] flex flex-col">
                            <div className="flex justify-between items-center mb-4 border-b-2 border-white pb-2">
                                <h2 className="text-white font-bold">FORM SUBMISSION PAYLOAD</h2>
                                <button onClick={() => setJsonOutput(null)} className="text-white hover:text-red-400 bg-red-900 px-2 font-bold focus:outline-none">X</button>
                            </div>
                            <pre className="text-blue-200 overflow-y-auto flex-1 font-mono text-sm leading-relaxed whitespace-pre-wrap">
                                {jsonOutput}
                            </pre>
                        </div>
                    </div>
                )}

                {nodes.length > 0 && (
                    <>
                        <div className="flex justify-end mb-4">
                            <button
                                onClick={exportPageJson}
                                className="text-xs bg-yellow-700 text-black font-bold px-3 py-1 border-2 border-yellow-500 hover:bg-yellow-600"
                            >
                                [ EXPORT PAGE AS JSON ]
                            </button>
                        </div>

                        <div className={`bg-gray-950 border-2 ${t.borderDark} p-6 min-h-[50vh] transition-all duration-500 ${t.shadow}`}>
                            {nodes.map(renderNode)}
                        </div>
                    </>
                )}

                {!loading && nodes.length === 0 && !error && (
                    <div className={`text-center ${t.textDark} mt-20 opacity-50`}>
                        <p>SYSTEM READY.</p>
                        <p>WAITING FOR INPUT...</p>
                    </div>
                )}
            </div>
        </div>
    );
}
