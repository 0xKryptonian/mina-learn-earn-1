import {
  SmartContract,
  Poseidon,
  Field,
  State,
  state,
  PublicKey,
  method,
  MerkleWitness,
  Struct,
  Bool,
  Provable,
} from 'o1js';

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

export class MessageManager extends SmartContract {
  @state(Field) eligibleAddressesCommitment = State<Field>();
  @state(Field) messagesCommitment = State<Field>();

  events = {
    MessageDeposited: Field,
  };

  @method init() {
    super.init();
    this.eligibleAddressesCommitment.set(Field(0));
    this.messagesCommitment.set(Field(0));
  }

  @method addEligibleAddress(
    address: Address,
    path: ElligibleAddressMerkleWitness
  ) {
    const count = path.calculateIndex();
    count.assertLessThan(Field(100));

    let newCommitment = path.calculateRoot(address.hash());
    this.eligibleAddressesCommitment.set(newCommitment);
  }

  @method depositMessage(
    address: Address,
    message: Message,
    eligibleAddressPath: ElligibleAddressMerkleWitness,
    messagePath: MessageMerkleWitness
  ) {

    const commitment = this.eligibleAddressesCommitment.getAndRequireEquals();

    eligibleAddressPath.calculateRoot(address.hash()).assertEquals(commitment);

    console.log('before message.data.toBits().slice(0, 6).reverse();');
    Provable.log(message.data);

    // Enforce flag rules
    const flags: Bool[] = message.data.toBits().slice(0, 6).reverse();
    const f1 = flags[0];
    const f2 = flags[1];
    const f3 = flags[2];
    const f4 = flags[3];
    const f5 = flags[4];
    const f6 = flags[5];

    console.log('after  message.data.toBits().slice(0, 6).reverse();');
    Provable.log(message.data);


    // If flag 1 is true, then all other flags must be false
    Bool.or(
      f1.not(),
      Bool.and(
        f2.not(),
        Bool.and(f3.not(), Bool.and(f4.not(), Bool.and(f5.not(), f6.not())))
      )
    ).assertTrue('flag 1 is true, and all other flags are not false');

    // If flag 2 is true, then flag 3 must also be true.
    Bool.or(f2.not(), Bool.and(f2, f3)).assertTrue(
      'flag 2 is true, and flag 3 is not true'
    );

    // If flag 4 is true, then flags 5 and 6 must be false.
    Bool.or(f4.not(), Bool.and(f5.not(), f6.not())).assertTrue(
      'flag 4 is true, and either flag 5 and 6 are not false'
    );

    // we calculate the new Merkle Root and set it
    let newCommitment = messagePath.calculateRoot(message.hash());
    this.messagesCommitment.set(newCommitment);

    // Emits a MessageDeposited event
    this.emitEvent('MessageDeposited', message.data);
    // this.emitEvent('MessageDeposited', message.hash());
  }
}
