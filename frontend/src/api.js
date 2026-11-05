const API_URL = "http://127.0.0.1:8000";

export async function classifyEmail(emailText) {
    const response = await fetch(
        `${API_URL}/api/classify`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email_Text: emailText
            })
        }
    );

    if (!response.ok) {
        throw new Error("Unable to classify email");
    }

    return response.json();
}