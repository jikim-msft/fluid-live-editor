import React, { useEffect, useState } from "react";
import CodeEditorWindow from "./CodeEditorWindow";
import axios from "axios";
import { classnames } from "../utils/general";
import { languageOptions } from "../constants/languageOptions";

import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import { defineTheme } from "../lib/defineTheme";
import useKeyPress from "../hooks/useKeyPress";
import Footer from "./Footer";
import OutputWindow from "./OutputWindow";
import CustomInput from "./CustomInput";
import OutputDetails from "./OutputDetails";
import ThemeDropdown from "./ThemeDropdown";
import LanguagesDropdown from "./LanguagesDropdown";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import { SharedMap, SharedString } from "fluid-framework";
import Editor, { DiffEditor, useMonaco, loader } from "@monaco-editor/react";

const javascriptDefault = ``

const Landing = () => {
  const getFluidData = async() => {
    const client = new TinyliciousClient();
    const containerSchema = {
      initialObjects: {
        sharedTimestamp: SharedMap,
      }
    }

    let container;
    const containerId = window.location.hash.substring(1);
    if (!containerId) {
      ({ container } = await client.createContainer(containerSchema));
      const id = await container.attach();
      window.location.hash = id;
    } else {
      ({ container } = await client.getContainer(containerId, containerSchema));
    }
    return container.initialObjects;
  }

  const [fluidSharedObjects, setFluidSharedObjects] = React.useState();
  React.useEffect(() => {
    getFluidData()
    .then(data => setFluidSharedObjects(data));
  }, []);

  const [localTimestamp, setLocalTimestamp] = React.useState();
  const [codeText, setCodeText] = React.useState(javascriptDefault);
  React.useEffect(() => {
    if (fluidSharedObjects) {

        // Set the value of the localTimestamp state object that will appear in the UI.
        const { sharedTimestamp } = fluidSharedObjects;
        const updateLocalTimestamp = () => {
          setLocalTimestamp({ time: sharedTimestamp.get("time") });
          setCodeText(sharedTimestamp.get("text"));
        };

        updateLocalTimestamp();

        // Register handlers.
        sharedTimestamp.on("valueChanged", updateLocalTimestamp);

        // Delete handler registration when the React App component is dismounted.
        return () => { sharedTimestamp.off("valueChanged", updateLocalTimestamp) }

    } else {
        return; // Do nothing because there is no Fluid SharedMap object yet.
    }
  }, [fluidSharedObjects])

  const [code, setCode] = useState(javascriptDefault);
  const [customInput, setCustomInput] = useState("");
  const [outputDetails, setOutputDetails] = useState(null);
  const [processing, setProcessing] = useState(null);
  const [theme, setTheme] = useState("cobalt");
  const [language, setLanguage] = useState(languageOptions[0]);

  const enterPress = useKeyPress("Enter");
  const ctrlPress = useKeyPress("Control");

  const onSelectChange = (sl) => {
    console.log("selected Option...", sl);
    setLanguage(sl);
  };

  useEffect(() => {
    if (enterPress && ctrlPress) {
      console.log("enterPress", enterPress);
      console.log("ctrlPress", ctrlPress);
      handleCompile();
    }
  }, [ctrlPress, enterPress]);
  
  const onChange = (action, data) => {
    switch (action) {
      case "code": {
        fluidSharedObjects.sharedTimestamp.set("text", data);
        setCode(fluidSharedObjects.sharedTimestamp.get("text"))
        setCodeText(fluidSharedObjects.sharedTimestamp.get("text"))
        break;
      }
      default: {
        console.warn("case not handled!", action, data);
      }
    }
  };
  const handleCompile = () => {
    setProcessing(true);
    const formData = {
      language_id: language.id,
      // encode source code in base64
      source_code: btoa(codeText), // code -> codeText 
      stdin: btoa(customInput),
    };
    const options = {
      method: "POST",
      url: process.env.REACT_APP_RAPID_API_URL,
      params: { base64_encoded: "true", fields: "*" },
      headers: {
        "content-type": "application/json",
        "Content-Type": "application/json",
        "X-RapidAPI-Host": process.env.REACT_APP_RAPID_API_HOST,
        "X-RapidAPI-Key": process.env.REACT_APP_RAPID_API_KEY,
      },
      data: formData,
    };

    axios
      .request(options)
      .then(function (response) {
        console.log("res.data", response.data);
        const token = response.data.token;
        checkStatus(token);
      })
      .catch((err) => {
        let error = err.response ? err.response.data : err;
        // get error status
        let status = err.response.status;
        console.log("status", status);
        if (status === 429) {
          console.log("too many requests", status);

          showErrorToast(
            `Quota of 100 requests exceeded for the Day! Please read the blog on freeCodeCamp to learn how to setup your own RAPID API Judge0!`,
            10000
          );
        }
        setProcessing(false);
        console.log("catch block...", error);
      });
  };

  const checkStatus = async (token) => {
    const options = {
      method: "GET",
      url: process.env.REACT_APP_RAPID_API_URL + "/" + token,
      params: { base64_encoded: "true", fields: "*" },
      headers: {
        "X-RapidAPI-Host": process.env.REACT_APP_RAPID_API_HOST,
        "X-RapidAPI-Key": process.env.REACT_APP_RAPID_API_KEY,
      },
    };
    try {
      let response = await axios.request(options);
      let statusId = response.data.status?.id;

      // Processed - we have a result
      if (statusId === 1 || statusId === 2) {
        // still processing
        setTimeout(() => {
          checkStatus(token);
        }, 2000);
        return;
      } else {
        setProcessing(false);
        setOutputDetails(response.data);
        showSuccessToast(`Compiled Successfully!`);
        console.log("response.data", response.data);
        return;
      }
    } catch (err) {
      console.log("err", err);
      setProcessing(false);
      showErrorToast();
    }
  };

  function handleThemeChange(th) {
    const theme = th;
    console.log("theme...", theme);

    if (["light", "vs-dark"].includes(theme.value)) {
      setTheme(theme);
    } else {
      defineTheme(theme.value).then((_) => setTheme(theme));
    }
  }
  useEffect(() => {
    defineTheme("oceanic-next").then((_) =>
      setTheme({ value: "oceanic-next", label: "Oceanic Next" })
    );
  }, []);

  const showSuccessToast = (msg) => {
    toast.success(msg || `Compiled Successfully!`, {
      position: "top-right",
      autoClose: 1000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
    });
  };
  const showErrorToast = (msg, timer) => {
    toast.error(msg || `Something went wrong! Please try again.`, {
      position: "top-right",
      autoClose: timer ? timer : 1000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
    });
  };

  return (
    <div>
      <ToastContainer
        position="top-right"
        autoClose={2000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />

      <a
        href="https://github.com/manuarora700/react-code-editor"
        title="Fork me on GitHub"
        class="github-corner"
        target="_blank"
        rel="noreferrer"
      >
        <svg
          width="50"
          height="50"
          viewBox="0 0 250 250"
          className="relative z-20 h-20 w-20"
        >
          <title>Fork me on GitHub</title>
          <path d="M0 0h250v250"></path>
          <path
            d="M127.4 110c-14.6-9.2-9.4-19.5-9.4-19.5 3-7 1.5-11 1.5-11-1-6.2 3-2 3-2 4 4.7 2 11 2 11-2.2 10.4 5 14.8 9 16.2"
            fill="currentColor"
            style={{ transformOrigin: "130px 110px" }}
            class="octo-arm"
          ></path>
          <path
            d="M113.2 114.3s3.6 1.6 4.7.6l15-13.7c3-2.4 6-3 8.2-2.7-8-11.2-14-25 3-41 4.7-4.4 10.6-6.4 16.2-6.4.6-1.6 3.6-7.3 11.8-10.7 0 0 4.5 2.7 6.8 16.5 4.3 2.7 8.3 6 12 9.8 3.3 3.5 6.7 8 8.6 12.3 14 3 16.8 8 16.8 8-3.4 8-9.4 11-11.4 11 0 5.8-2.3 11-7.5 15.5-16.4 16-30 9-40 .2 0 3-1 7-5.2 11l-13.3 11c-1 1 .5 5.3.8 5z"
            fill="currentColor"
            class="octo-body"
          ></path>
        </svg>
      </a>

      <div className="h-4 w-full bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500"></div>
      <div className="flex flex-row">
        <div className="px-4 py-2">
          <LanguagesDropdown onSelectChange={onSelectChange} />
        </div>
        {/* <div className="px-4 py-2">
          <ThemeDropdown handleThemeChange={handleThemeChange} theme={theme} />
        </div> */}
      </div>
      <div className="flex flex-row space-x-4 items-start px-4 py-4">
        <div className="flex flex-col w-full h-full justify-start items-end">
          {/* <CodeEditorWindow
            onChange={onChange}
            language={language?.value}
            theme={theme.value}
            value={codeText}
            code={codeText}
          /> */}
          <Editor
            height="90vh"
            defaultLanguage="javascript"
            defaultValue={javascriptDefault}
            value={codeText}
            onChange={(e) => fluidSharedObjects.sharedTimestamp.set("text", e)}
          />
          {/* <textarea rows="50" cols="100" 
          value={codeText} onChange={(e) => fluidSharedObjects.sharedTimestamp.set("text", e.target.value)}/> */}
        </div>

        <div className="right-container flex flex-shrink-0 w-[30%] flex-col">
          <OutputWindow outputDetails={outputDetails} />
          <div className="flex flex-col items-end">
            <CustomInput
              customInput={customInput}
              setCustomInput={setCustomInput}
            />
            <button
              onClick={handleCompile}
              disabled={!code}
              className={classnames(
                "mt-4 border-2 border-black z-10 rounded-md shadow-[5px_5px_0px_0px_rgba(0,0,0)] px-4 py-2 hover:shadow transition duration-200 bg-white flex-shrink-0",
                !code ? "opacity-50" : ""
              )}
            >
              {processing ? "Processing..." : "Compile and Execute"}
            </button>
          </div>
          {outputDetails && <OutputDetails outputDetails={outputDetails} />}
        </div>
      </div>
      <Footer />

      {/* <Editor
        height="90vh"
        defaultLanguage="javascript"
        defaultValue="// some comment"
      /> */}

      {/* <div className="App">
        <textarea rows="50" cols="100"
          value={codeText} onChange={(e) => fluidSharedObjects.sharedTimestamp.set("text", e.target.value)}/>
      </div> */}

    </div>
  );
};
export default Landing;
