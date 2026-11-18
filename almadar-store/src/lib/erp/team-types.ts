export type TeamContact = {
  id: string;
  fullName: string;
  username: string;
  department: string;
  title: string;
};

export type TeamMessage = {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

export type TeamActor = { id: string; role: string; fullName: string };

export type TeamConversation = {
  contactId: string;
  contactName: string;
  lastBody: string;
  lastAt: string;
  lastSenderId: string;
  unreadCount: number;
};

export type TeamCursor = { createdAt: string; id: string };
