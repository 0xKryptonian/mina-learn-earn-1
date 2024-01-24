import {
  Poseidon,
  Field,
  PublicKey,
  Mina,
  PrivateKey,
  AccountUpdate,
  MerkleTree,
  MerkleWitness,
  Struct,
  // fetchEvents,
  UInt32,
} from 'o1js';
import { MessageManager } from './SecretMessages';

interface SenderAccountInfo {
  privateKey: PrivateKey;
  publicKey: PublicKey;
}

class ElligibleAddressMerkleWitness extends MerkleWitness(8) {}
class MessageMerkleWitness extends MerkleWitness(8) {}

class Address extends Struct({
  publicKey: PublicKey,
}) {
  hash(): Field {
    return Poseidon.hash(Address.toFields(this));
  }
}

class Message extends Struct({
  publicKey: PublicKey,
  data: Field,
}) {
  hash(): Field {
    return Poseidon.hash(Message.toFields(this));
  }
}

const proofsEnabled = false;

describe('SecretMessages.test.js', () => {
  let zkApp: MessageManager,
    zkAppAddress: PublicKey,
    zkAppPrivKey: PrivateKey,
    senderAccounts: Array<SenderAccountInfo>,
    deployerAcc: PublicKey,
    deployerAccPrivKey: PrivateKey,
    messages: Map<PublicKey, Field>,
    eligibleAddresses: Array<PublicKey>,
    messageTree: MerkleTree,
    eligibleAddressesTree: MerkleTree;

  beforeAll(async () => {
    proofsEnabled && (await MessageManager.compile());

    const localBlockchain = Mina.LocalBlockchain({ proofsEnabled: false });
    Mina.setActiveInstance(localBlockchain);

    senderAccounts = new Array<SenderAccountInfo>();

    for (let i = 0; i < 100; i++) {
      const privateKey = PrivateKey.random();
      const publicKey = privateKey.toPublicKey();
      senderAccounts.push({ privateKey, publicKey });
    }

    messageTree = new MerkleTree(8);
    eligibleAddressesTree = new MerkleTree(8);
  });

  beforeEach(async () => {
    const localBlockchain = Mina.LocalBlockchain({ proofsEnabled });
    Mina.setActiveInstance(localBlockchain);
    ({ privateKey: deployerAccPrivKey, publicKey: deployerAcc } =
      localBlockchain.testAccounts[0]);

    eligibleAddresses = new Array<PublicKey>();
    messages = new Map<PublicKey, Field>();

    zkAppPrivKey = PrivateKey.random();
    zkAppAddress = zkAppPrivKey.toPublicKey();
    zkApp = new MessageManager(zkAppAddress);
  });

  async function localDeploy(prove: boolean = false, wait: boolean = false) {
    const txn = await Mina.transaction(deployerAcc, () => {
      AccountUpdate.fundNewAccount(deployerAcc);
      zkApp.deploy({ zkappKey: zkAppPrivKey });
    });
    prove = true;
    if (prove) {
      await txn.prove();
    }
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    // const txPromise = await txn.sign([deployerAccPrivKey, zkAppPrivKey]).send();
    await txn.sign([deployerAccPrivKey, zkAppPrivKey]).send();

    if (wait) {
      // await txPromise.wait();
    }
  }

  async function performAddEligibleAddress(senderAcc: PublicKey) {
    const { address, witness, newEligibleAddresses } = initAddEligibleAddress(
      senderAcc,
      eligibleAddresses
    );

    const tx = await Mina.transaction(deployerAcc, () => {
      zkApp.addEligibleAddress(address, witness);
    });
    await tx.prove();
    await tx.sign([deployerAccPrivKey]).send();

    eligibleAddresses.push(senderAcc);

    return { address, witness, newEligibleAddresses };
  }

  async function performDepositMessage(senderAcc: PublicKey, message: Field) {
    const {
      address,
      message: msg,
      addressWitness,
      messageWitness,
    } = await initDepositMessage(senderAcc, message);

    const tx = await Mina.transaction(deployerAcc, () => {
      zkApp.depositMessage(
        address,
        msg,
        addressWitness,
        messageWitness,
        nullifier
      );
    });
    await tx.prove();
    await tx.sign([deployerAccPrivKey]).send();

    messages.set(senderAcc, message);
    messageTree.setLeaf(BigInt(messages.size), msg.hash());
  }

  async function handleMultipleAddEligibleAddresses(
    accounts: Array<SenderAccountInfo>
  ) {
    for (const senderAcc of accounts) {
      const { address, witness } = initAddEligibleAddress(
        senderAcc.publicKey,
        eligibleAddresses
      );

      const txAdd = await Mina.transaction(deployerAcc, () => {
        zkApp.addEligibleAddress(address, witness);
      });

      await txAdd.prove();
      await txAdd.sign([deployerAccPrivKey, zkAppPrivKey]).send();

      // After the transaction is sent and confirmed, push the publicKey to eligibleAddresses
      eligibleAddresses.push(senderAcc.publicKey);
    }

    return eligibleAddresses;
  }

});
