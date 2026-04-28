const MojoMapQuiz = ({ onClose }: { onClose: () => void }) => (
  <div style={{ padding: "48px 36px", maxWidth: 640, margin: "0 auto" }}>
    <p style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.16em", color: "#999", marginBottom: 24 }}>
      MOJOMAP QUIZ — COMING SOON
    </p>
    <button
      onClick={onClose}
      style={{
        fontFamily: "monospace",
        fontSize: 11,
        letterSpacing: "0.14em",
        padding: "10px 20px",
        border: "1.5px solid #111",
        background: "none",
        cursor: "pointer",
      }}
    >
      CLOSE
    </button>
  </div>
);

export default MojoMapQuiz;
