const fetchData = async () => {
  const body = {
    student_id: "1010020612",
    course_id: "Temas relevante en asuntos agrarios",
    question: "Quien es Juan",
  };

  const response = await fetch(
    "https://course-storage-api-qdrant-1018797915827.us-east1.run.app/qa",
    {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const data = await response.json();
  console.log(data);
};

fetchData().then((data) => {
  console.log(data);
});
