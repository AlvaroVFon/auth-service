import { QueryFilter } from 'mongoose';
import mongoose from 'mongoose';
import { defaultsRegistry } from './defaults/defaults.registry';

export class Fixture {
  async registerModel<T>(
    modelName: string,
    schema: mongoose.Schema<T>,
  ): Promise<void> {
    if (!mongoose.models[modelName]) {
      mongoose.model<T>(modelName, schema);
    }
  }

  async create<T>(modelName: string, data?: Partial<T>): Promise<T> {
    const Model = mongoose.model<T>(modelName);
    const defaultData: any = defaultsRegistry[modelName] ?? {};

    const alreadyExists = await this.alreadyCreated<T>(modelName);
    if (alreadyExists && defaultData._id) {
      await Model.deleteOne({ _id: defaultData._id }).exec();
    }

    const mergedData = { ...defaultData, ...data };
    return Model.create(mergedData);
  }

  async createMany<T>(
    modelName: string,
    dataArray?: Partial<T>[],
  ): Promise<T[]> {
    const Model = mongoose.model<T>(modelName);
    const items = dataArray && dataArray.length > 0 ? dataArray : [{}];

    const defaultData: any = defaultsRegistry[modelName] ?? {};
    const alreadyExists = await this.alreadyCreated<T>(modelName);
    if (alreadyExists && defaultData._id) {
      await Model.deleteOne({ _id: defaultData._id }).exec();
    }

    const documents = items.map((data, index) => {
      const doc = { ...defaultData, ...data };
      if (index > 0 && doc._id && doc._id === defaultData._id) {
        delete doc._id;
      }
      return doc;
    });

    return Model.insertMany(documents) as any;
  }

  async find<T>(modelName: string, query: QueryFilter<T>): Promise<T[]> {
    const Model = mongoose.model<T>(modelName);
    return Model.find(query).exec();
  }

  async findOne<T>(
    modelName: string,
    query: QueryFilter<T>,
  ): Promise<T | null> {
    const Model = mongoose.model<T>(modelName);
    return Model.findOne(query).exec();
  }

  async findById<T>(modelName: string, id: string): Promise<T | null> {
    const Model = mongoose.model<T>(modelName);
    return Model.findById(id).exec();
  }

  async updateOne<T>(
    modelName: string,
    query: QueryFilter<T>,
    updateData: Partial<T>,
  ): Promise<void> {
    const Model = mongoose.model<T>(modelName);
    await Model.updateOne(query, updateData).exec();
  }

  async deleteOne<T>(modelName: string, query: QueryFilter<T>): Promise<void> {
    const Model = mongoose.model<T>(modelName);
    await Model.deleteOne(query).exec();
  }

  private async alreadyCreated<T>(modelName: string): Promise<boolean> {
    const Model = mongoose.model<T>(modelName);
    const defaultData: any = defaultsRegistry[modelName] ?? {};
    if (!defaultData._id) {
      return false;
    }
    const existing = await Model.findById(defaultData._id).exec();
    return existing !== null;
  }
}

export default new Fixture();
