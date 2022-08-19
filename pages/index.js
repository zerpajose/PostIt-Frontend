import Head from "next/head";
import styles from "../styles/Home.module.css";
import { Alert, AlertTitle, TextField, Radio, RadioGroup, FormControlLabel, FormControl, FormLabel } from "@mui/material";
import Web3Modal from "web3modal";
import { providers, Contract } from "ethers";
import { useEffect, useRef, useState } from "react";
import { POSTIT_CONTRACT_ADDRESS, abi } from "../constants";
import Web3Token from 'web3-token';
import axios from "axios";

export default function Home() {
  // walletConnected keep track of whether the user's wallet is connected or not
  const [walletConnected, setWalletConnected] = useState(false);
  // joinedWhitelist keeps track of whether the current metamask address has joined the Whitelist or not
  const [joinedWhitelist, setJoinedWhitelist] = useState(false);
  // loading is set to true when we are waiting for a transaction to get mined
  const [loading, setLoading] = useState(false);
  // numberOfWhitelisted tracks the number of addresses's whitelisted
  const [numberOfWhitelisted, setNumberOfWhitelisted] = useState(0);
  // for localstorage
  const [items, setItems] = useState("");
  // form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // a message in the form
  const [message, setMessage] = useState("");

  const [isTheOwner, setIsTheOwner] = useState(false);
  const [isAllowed, setIsAllowed] = useState(false);

  const [addressSignedIn, setAddressSignedIn] = useState("");

  const [contractOwner, setContractOwner] = useState("");
  // Create a reference to the Web3 Modal (used for connecting to Metamask) which persists as long as the page is open
  const web3ModalRef = useRef();

  /**
   * Returns a Provider or Signer object representing the Ethereum RPC with or without the
   * signing capabilities of metamask attached
   *
   * A `Provider` is needed to interact with the blockchain - reading transactions, reading balances, reading state, etc.
   *
   * A `Signer` is a special type of Provider used in case a `write` transaction needs to be made to the blockchain, which involves the connected account
   * needing to make a digital signature to authorize the transaction being sent. Metamask exposes a Signer API to allow your website to
   * request signatures from the user using Signer functions.
   *
   * @param {*} needSigner - True if you need the signer, default false otherwise
   */
  const getProviderOrSigner = async (needSigner = false) => {
    // Connect to Metamask
    // Since we store `web3Modal` as a reference, we need to access the `current` value to get access to the underlying object
    const provider = await web3ModalRef.current.connect();
    const web3Provider = new providers.Web3Provider(provider);

    // If user is not connected to the Mumbai network, let them know and throw an error
    const { chainId } = await web3Provider.getNetwork();
    if (chainId !== 80001) {
      window.alert("Change the network to Mumbai");
      throw new Error("Change network to Mumbai");
    }

    if (needSigner) {
      const signer = web3Provider.getSigner();
      return signer;
    }
    return web3Provider;
  };

  /**
   * addAddressToWhitelist: Adds the current connected address to the whitelist
   */
  const addAddressToWhitelist = async () => {
    try {
      // We need a Signer here since this is a 'write' transaction.
      const signer = await getProviderOrSigner(true);
      // Create a new instance of the Contract with a Signer, which allows
      // update methods
      const whitelistContract = new Contract(
        POSTIT_CONTRACT_ADDRESS,
        abi,
        signer
      );
      // call the addAddressToWhitelist from the contract
      const tx = await whitelistContract.addAddressToWhitelist();
      setLoading(true);
      // wait for the transaction to get mined
      await tx.wait();
      setLoading(false);
      // get the updated number of addresses in the whitelist
      await getNumberOfWhitelisted();
      setJoinedWhitelist(true);
    } catch (err) {
      console.error(err);
    }
  };

  /**
   * getNumberOfWhitelisted:  gets the number of whitelisted addresses
   */
  const getNumberOfWhitelisted = async () => {
    try {
      // Get the provider from web3Modal, which in our case is MetaMask
      // No need for the Signer here, as we are only reading state from the blockchain
      const provider = await getProviderOrSigner();
      // We connect to the Contract using a Provider, so we will only
      // have read-only access to the Contract
      const whitelistContract = new Contract(
        POSTIT_CONTRACT_ADDRESS,
        abi,
        provider
      );
      // call the numAddressesWhitelisted from the contract
      const _numberOfWhitelisted = await whitelistContract.numAddressesWhitelisted();
      setNumberOfWhitelisted(_numberOfWhitelisted);
    } catch (err) {
      console.error(err);
    }
  };

  /**
   * checkIfAddressInWhitelist: Checks if the address is in whitelist
   */
  const checkIfAddressInWhitelist = async () => {
    try {
      // We will need the signer later to get the user's address
      // Even though it is a read transaction, since Signers are just special kinds of Providers,
      // We can use it in it's place
      const signer = await getProviderOrSigner(true);
      const whitelistContract = new Contract(
        POSTIT_CONTRACT_ADDRESS,
        abi,
        signer
      );
      // Get the address associated to the signer which is connected to  MetaMask
      const address = await signer.getAddress();
      // call the whitelistedAddresses from the contract
      const _joinedWhitelist = await whitelistContract.whitelistedAddresses(
        address
      );
      setJoinedWhitelist(_joinedWhitelist);
    } catch (err) {
      console.error(err);
    }
  };

  // New Post from Form POST to API
  const handleNewPost = async (e) => {
    setLoading(true);
    e.preventDefault();

    const form_data = { name: name, description: description };
    // const form_data = new FormData();
    // form_data.append('name', name);
    // form_data.append('description', description);

    const config = {
      headers: {
        "Content-Type": "application/json",
        "Authorization": items
      },
    };

    try {
      console.log(JSON.stringify(form_data));
      axios.post(`http://localhost:3001/postit`, form_data, config)
      .then(async (response) => {
        if (response.status === 200) {
          
          console.log(JSON.stringify(response.data.IpfsHash));
          /* Mint the NFT */
          await mintNFT(response.data.IpfsHash);

          setName("");
          setDescription("");

        } else {
          setMessage("Some error occured");
        }
      });

    } catch (err) {
      console.log(err);
    }
  };

  const mintNFT = async (_uri) => {
    try {
      // We need a Signer here since this is a 'write' transaction.
      const signer = await getProviderOrSigner(true);
      // Create a new instance of the Contract with a Signer, which allows
      // update methods
      const nftContract = new Contract(POSTIT_CONTRACT_ADDRESS, abi, signer);

      // call the addAddressToWhitelist from the contract
      const tx = await nftContract.safeMint(`https://gateway.pinata.cloud/ipfs/${_uri}`);
      
      // wait for the transaction to get mined
      const receipt = await tx.wait();

      setLoading(false);

      setMessage(`PostIt minted succesfully, transaction hash: ${receipt.transactionHash}`);

    } catch (err) {
      console.error(err);
    }
  };

  // Verify if signer is the Contract Owner
  const isOwner = async () => {
    setLoading(true);
    const signer = await getProviderOrSigner(true);
    const token = await Web3Token.sign(async msg => await signer.signMessage(msg), '1d');

    axios.post(
      `http://localhost:3001/is_owner`,
      {},
      {
        headers: {
          'Authorization': `${token}`
        }
      }
    ).then(function (response) {
      setItems(response.data.token);
      setIsTheOwner(response.data.is_owner);
      setContractOwner(response.data.owner_address);

      if(!response.data.is_owner){
        setMessage("You are not the owner");
      }
    })
    .catch(function (error) {
      console.log(error);
    });
    setLoading(false);
  }

  // Verify if signer is Allowed to mint an NFT
  const is_allowed = async () => {
    setLoading(true);
    const signer = await getProviderOrSigner(true);
    const token = await Web3Token.sign(async msg => await signer.signMessage(msg), '1d');

    axios.post(
      `http://localhost:3001/is_allowed`,
      {},
      {
        headers: {
          'Authorization': `${token}`
        }
      }
    ).then(function (response) {
      setItems(response.data.token);
      setIsAllowed(response.data.is_allowed);
      setContractOwner(response.data.owner_address);

      if(!response.data.is_allowed){
        setMessage("You are not allowed to mint a PostIt");
      }
    })
    .catch(function (error) {
      console.log(error);
    });
    setLoading(false);
  }

  // sign-in with wallet
  const signIn = async () => {
    setLoading(true);
    const signer = await getProviderOrSigner(true);
    const token = await Web3Token.sign(async msg => await signer.signMessage(msg), '1d');

    axios.post(
      `http://localhost:3001/sign_in`,
      {},
      {
        headers: {
          'Authorization': `${token}`
        }
      }
    ).then(function (response) {
      setItems(response.data.token);
      setAddressSignedIn(response.data.address);
      is_allowed();

    })
    .catch(function (error) {
      console.log(error);
    });
    setLoading(false);
  }

  const getWL = async () => {
    try {
      // We need a Signer here since this is a 'write' transaction.
      const signer = await getProviderOrSigner(true);
      // Create a new instance of the Contract with a Signer, which allows
      // update methods
      const contract = new Contract(POSTIT_CONTRACT_ADDRESS, abi, signer);
      // call the mint from the contract to mint the Crypto Dev

      const tx = await contract.setAllowList({
        value: 1000000000000000,
      });

      setLoading(true);
      await tx.wait();
      setLoading(false);
      
      //window.alert("You successfully minted a Sheinix DAO NFT!");
      setMessage("Now you can create PostIt");
      setIsAllowed(true);
      
    } catch (err) {
      console.error(err);
    }
  };

  /*
    connectWallet: Connects the MetaMask wallet
  */
  const connectWallet = async () => {
    try {
      // Get the provider from web3Modal, which in our case is MetaMask
      // When used for the first time, it prompts the user to connect their wallet
      await getProviderOrSigner();
      setWalletConnected(true);

      checkIfAddressInWhitelist();
      getNumberOfWhitelisted();
    } catch (err) {
      console.error(err);
    }
  };

  /*
    renderButton: Returns a button based on the state of the dapp
  */
  const renderButton = () => {
    if (walletConnected) {

      if(addressSignedIn == ""){
        return (
            <div>
              <button onClick={signIn} className={styles.button}>
                Sign-In
              </button>
              {message ? <Alert severity="warning" color="error"><AlertTitle>Error</AlertTitle>{message}</Alert> : null}
            </div>          
          );
      } else {
        if (isAllowed) {
          return (
            <div>
              <form onSubmit={handleNewPost}>
                <input type="text" value={name} onChange={e => setName(e.target.value)} />
                <textarea value={description} onChange={e => setDescription(e.target.value)} />
                
                <button type="submit">PostIt</button>
                {message ? <p>{message}</p> : null}
              </form>
            </div>
          );
        } else if (loading) {
          return <button className={styles.button}>Loading...</button>;
        } else {
          return (
            <div>
              <button onClick={getWL} className={styles.button}>
                Get Allowlisted
              </button>
              {message ? <Alert severity="warning" color="error"><AlertTitle>Error</AlertTitle>{message}</Alert> : null}
            </div>
          );
        }
      }
    } else {
      return (
        <button onClick={connectWallet} className={styles.button}>
          Connect your wallet
        </button>
      );
    }
  };

  // useEffects are used to react to changes in state of the website
  // The array at the end of function call represents what state changes will trigger this effect
  // In this case, whenever the value of `walletConnected` changes - this effect will be called
  useEffect(() => {
    // if wallet is not connected, create a new instance of Web3Modal and connect the MetaMask wallet
    if (!walletConnected) {
      // Assign the Web3Modal class to the reference object by setting it's `current` value
      // The `current` value is persisted throughout as long as this page is open
      web3ModalRef.current = new Web3Modal({
        network: "opkovan",
        providerOptions: {},
        disableInjectedProvider: false,
      });
      connectWallet();
    }
  }, [walletConnected]);

  return (
    <div>
      <Head>
        <title>Whitelist Dapp</title>
        <meta name="description" content="Whitelist-Dapp" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className={styles.main}>
        <div>
          <h1 className={styles.title}>Welcome to PostIt!</h1>
          <div className={styles.description}>
            Manage your sticky notes as NFT's.
          </div>
          <div className={styles.description}>
            {numberOfWhitelisted} have already joined the Whitelist
          </div>

          {renderButton()}
        </div>
        <div>
          <img className={styles.image} src="./logo.png" />
        </div>
      </div>

      <footer className={styles.footer}>
        Made with &#10084; by CryptoVincent
      </footer>
    </div>
  );
}