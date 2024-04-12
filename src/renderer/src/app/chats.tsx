import ChatBar from "@/components/ChatBar";
import ChatsSidebar from "@/components/ChatsSidebar";
import Message from "@/components/Message";
import { queries } from "@/lib/queries";
import { time } from "@/lib/time";
import { CardBundle, PersonaBundle, UIMessage } from "@shared/types";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import "../styles/global.css";
import { reply } from "@/lib/reply";

function ChatsPage(): JSX.Element {
  const [chatID, setChatID] = useState(1);
  const [personaBundle, setPersonaBundle] = useState<PersonaBundle>();
  const [cardBundle, setCardBundle] = useState<CardBundle>();
  const [chatHistory, setChatHistory] = useState<UIMessage[]>([]);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const [editingMessageID, setEditingMessageID] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [userInput, setUserInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  // Sync states with db on load
  useEffect(() => {
    syncCardBundle();
    syncPersonaBundle();
    syncChatHistory();
  }, [chatID]);

  const syncCardBundle = async () => {
    const res = await queries.getCardBundle(chatID);
    if (res.kind == "err") {
      toast.error("Error fetching card bundle.");
      return;
    }
    setCardBundle(res.value);
  };

  const syncPersonaBundle = async () => {
    const res = await queries.getPersonaBundle(chatID);
    if (res.kind == "err") {
      toast.error("Error fetching persona bundle.");
      return;
    }
    setPersonaBundle(res.value);
  };

  const syncChatHistory = async () => {
    const res = await queries.getChatHistory(chatID);
    if (res.kind == "err") {
      toast.error("Error fetching chat history.");
      return;
    }
    setChatHistory(res.value);
  };

  // Scroll to bottom on load
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  // Add escape key listener to exit edit mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEditingMessageID(null);
      }
    };
    if (editingMessageID !== null) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [editingMessageID]);

  // Loading screen
  if (!personaBundle || !cardBundle) {
    return <div className="h-screen w-screen bg-neutral-800 "></div>;
  }

  const handleEditSubmit = (id: number) => {
    setEditingMessageID(null);
    // Optimistic update
    const newChatHistory = chatHistory.map((msg) => {
      if (msg.id === id) {
        return { ...msg, text: editText };
      }
      return msg;
    });
    setChatHistory(newChatHistory);
    // Update message in the db
    queries.updateMessage(id, editText);
    syncChatHistory();
  };

  const handleSendMessage = async () => {
    const cachedUserInput = userInput;
    // Optimistically clear userInput and append the user's message to the chat history
    setIsTyping(true);
    setUserInput("");
    setChatHistory((prevMessages: UIMessage[]) => [
      ...prevMessages,
      {
        id: -1,
        sender: "user",
        text: cachedUserInput,
        inserted_at: new Date().toISOString()
      }
    ]);

    // Generate a reply
    let characterReply: string;
    try {
      characterReply = await reply.generate(chatID, cardBundle.data, personaBundle.data, userInput);
      const insertRes = await queries.insertMessagePair(chatID, userInput, characterReply);
      if (insertRes.kind == "err") {
        toast.error(`Failed to insert user and character mesage into database. 
        Error ${insertRes.error}`);
        return;
      }
    } catch (e) {
      toast.error(`Failed to generate a reply. Error: ${e}`);
      console.error(e);
      // Restore the user's input
      setUserInput(cachedUserInput);
    } finally {
      setIsTyping(false);
      syncChatHistory();
    }
  };

  const handleRegenerate = () => {};

  return (
    <>
      <ChatsSidebar
        chatID={chatID}
        setChatID={setChatID}
        personaBundle={personaBundle}
        syncChatHistory={syncChatHistory}
      />
      {/* Main Content */}
      <div className="flex h-full w-full grow flex-row overflow-x-hidden">
        {/* Chat Area and Chat Bar Wrapper*/}
        <div className="relative flex h-full flex-auto flex-col pl-8 pt-8">
          {/* Chat Area */}
          <div className="scroll-primary flex grow scroll-py-0 flex-col space-y-4 overflow-y-scroll scroll-smooth px-5 py-1 transition duration-500 ease-out">
            {chatHistory?.map((message, idx) => {
              const iso = time.sqliteToISO(message.inserted_at);
              const relativeTime = time.isoToLLMRelativeTime(iso);
              const isLatest = idx === chatHistory.length - 1;
              const isLatestCharacterMessage = message.sender === "character" && idx >= chatHistory.length - 2;
              return (
                <Message
                  key={idx}
                  messageID={message.id}
                  avatar={message.sender === "user" ? personaBundle.avatarURI || "" : cardBundle.avatarURI || ""}
                  name={message.sender === "user" ? personaBundle.data.name : cardBundle.data.character.name}
                  sender={message.sender}
                  text={message.text}
                  timestring={relativeTime}
                  isLatest={isLatest}
                  isLatestCharacterMessage={isLatestCharacterMessage}
                  isEditing={editingMessageID === message.id}
                  handleEdit={() => setEditingMessageID(message.id)}
                  setEditText={setEditText}
                  handleEditSubmit={() => handleEditSubmit(message.id)}
                  handleRegenerate={handleRegenerate}
                />
              );
            })}
            <div ref={chatScrollRef} />
          </div>

          <ChatBar
            chatID={chatID}
            personaData={personaBundle.data}
            cardData={cardBundle.data}
            isTyping={isTyping}
            userInput={userInput}
            setUserInput={setUserInput}
            handleSendMessage={handleSendMessage}
            className="mb-1 mr-5"
          />
        </div>
      </div>
    </>
  );
}

export default ChatsPage;