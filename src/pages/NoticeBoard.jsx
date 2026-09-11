import { useNavigate } from "react-router-dom";

// Stub — will list community/festival event info.
export default function NoticeBoard() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: "1.5rem", textAlign: "center" }}>
      <h1>Notice Board</h1>
      <p>Community + festival event listings go here next.</p>
      <button onClick={() => navigate("/")}>Back to street</button>
    </div>
  );
}
